/** 正式执行编排：只接收宿主鉴权结果，不建立公开 HTTP 写接口。 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { projectRoot } from './config.mjs';
import { runGoldberriesDryRun, checkProposalCovers, readGoldberriesCover } from './goldberries-review.mjs';

/** 上传失败发生在事务前；数据库提交异常时保留对象，避免删除可能已经提交的封面。 */
export async function applyOneProposal(item, { readCover, upload, remove, commit, authorize }) {
  const uploaded = [];
  let commitAttempted = false;
  async function cleanup(objects) {
    const retained = [];
    for (const object of objects) { try { await remove(object.key); } catch { retained.push(object.key); } }
    return retained;
  }
  try {
    if (!await authorize()) return { status: 'skipped', reason: '管理员权限已失效' };
    const downloaded = await checkProposalCovers(item.covers, readCover);
    const seen = new Map();
    async function store(cover) {
      const hash = createHash('sha256').update(cover.buffer).digest('hex');
      if (!seen.has(hash)) { const object = await upload(cover.buffer); uploaded.push(object); seen.set(hash, object); }
      return { ...seen.get(hash), source: cover.url };
    }
    const campaign = await store(downloaded.campaign), map = await store(downloaded.map);
    const covers = { campaign, map, fallback: !!downloaded.map.fallback };
    if (!await authorize()) return { status: 'skipped', reason: '管理员权限已失效', retainedUploads: await cleanup(uploaded) };
    commitAttempted = true;
    const result = await commit(item, covers);
    // commit 已确认成功（或事务正常结束且跳过），只有未引用的本次随机对象可以删除。
    const used = new Set(result.usedKeys ?? []);
    const retainedUploads = await cleanup(uploaded.filter(o => !used.has(o.key)));
    return { ...result, uploadCount: uploaded.length, retainedUploads };
  } catch (error) {
    const retainedUploads = commitAttempted ? uploaded.map(o => o.key) : await cleanup(uploaded);
    return { status: 'error', reason: error.message, commitUncertain: commitAttempted, retainedUploads,
      uploadCount: uploaded.length };
  }
}

export async function runGoldberriesApply({ actor, authorize, onProgress = async () => {} }) {
  if (typeof authorize !== 'function' || !await authorize()) throw new Error('没有管理员权限');
  const [{ db, pool }, { importGoldberriesProposal }, { ossConfig, uploadImage, deleteObject }] = await Promise.all([
    tsImport('../backend/src/db/client.ts', import.meta.url),
    tsImport('../backend/src/modules/records/goldberries-import.ts', import.meta.url),
    tsImport('../backend/src/integrations/oss.ts', import.meta.url),
  ]);
  const oss = ossConfig();
  if (!oss) throw new Error('OSS 未配置');
  const lock = await pool.connect();
  let locked = false;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`;
  const directory = join(projectRoot, 'qqbot', 'logs', 'goldberries');
  const path = join(directory, `${runId}.json`);
  const report = { mode: 'apply', runId, startedAt: new Date().toISOString(), items: [] };
  const persist = async () => { await writeFile(path + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); await rename(path + '.tmp', path); };
  try {
    locked = (await lock.query("SELECT pg_try_advisory_lock(hashtext('cngist-goldberries-import')) AS acquired")).rows[0].acquired;
    if (!locked) throw new Error('已有新挑战导入任务正在运行');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const scan = await runGoldberriesDryRun({ verifyCovers: false });
    report.total = scan.total;
    await persist();
    for (const item of scan.items) {
      if (item.status !== 'candidate') report.items.push({ ...item, status: 'skipped' });
      else {
        const outcome = await applyOneProposal(item, {
          authorize,
          readCover: readGoldberriesCover,
          upload: buffer => uploadImage(oss, buffer, 'catalog'),
          remove: key => deleteObject(oss, key),
          commit: (plan, covers) => db.transaction(tx => importGoldberriesProposal(tx, plan, covers, actor)),
        });
        report.items.push({ ...item, ...outcome });
      }
      await persist();
      if (report.items.length % 10 === 0) {
        // 回复失败不能回滚已确认的导入，也不能使任务重新执行。
        await onProgress(`新挑战审核：已处理 ${report.items.length}/${report.total}，成功 ${report.items.filter(i => i.status === 'applied').length} 条。`).catch(() => {});
      }
    }
    report.finishedAt = new Date().toISOString();
    await persist();
    return report;
  } finally {
    try { if (locked) await lock.query("SELECT pg_advisory_unlock(hashtext('cngist-goldberries-import'))"); }
    finally { lock.release(); }
  }
}

export function formatApplyReport(report) {
  const applied = report.items.filter(i => i.status === 'applied');
  const failed = report.items.filter(i => i.status === 'error');
  const skipped = report.items.filter(i => i.status === 'skipped');
  const counts = key => applied.filter(i => i.created?.[key]).length;
  const heading = `新挑战审核完成\n处理 ${report.items.length} 条：成功 ${applied.length}，跳过 ${skipped.length}，失败/待核对 ${failed.length}\n新建地图包 ${counts('campaign')}、地图 ${counts('map')}、挑战 ${counts('challenge')}；成功记录按 Std 规则通过（未经人工验片）。`;
  const pages = []; let page = heading;
  for (const item of report.items) {
    const detail = item.status === 'applied'
      ? `${item.tier} ${item.targetType}；包${item.created.campaign ? '新建' : '复用'} #${item.campaignId}、图${item.created.map ? '新建' : '复用'} #${item.mapId}、挑战${item.created.challenge ? '新建' : '复用'} #${item.challengeId}；${item.addedCovers.campaign ? '地图包封面已上传' : '保留地图包封面'}；${item.addedCovers.map ? (item.mapCoverFallback ? '地图复用包封面' : '地图封面已上传') : '保留地图封面'}${item.fcTagAdded ? '；加 FC 标签' : ''}`
      : `${item.reason}${item.commitUncertain ? '；提交状态需核对，重跑不会处理已完成记录' : ''}`;
    const line = `\n#${item.submissionId} ${item.mapName}：${detail}`;
    if (page.length + line.length > 1600) { pages.push(page); page = '新挑战审核结果（续）'; }
    page += line;
  }
  if (report.items.some(i => i.retainedUploads?.length)) page += '\n部分上传对象保留待核对，详情已写入本机任务日志。';
  pages.push(page); return pages;
}
