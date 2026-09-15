/** 新挑战来源比对与 QQ 指令；dry-run 查询与正式写入路径分开。 */
import { Pool } from 'pg';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';
import { appConfig } from './config.mjs';
const { detectImage } = await tsImport('../backend/src/integrations/oss.ts', import.meta.url);
const origin = 'https://goldberries.net';
const normalize = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
export function gameBananaKey(value) {
  try { const u = new URL(value); return u.hostname === 'gamebanana.com' && /^\/(mods|wips)\/\d+\/?$/.test(u.pathname) ? u.pathname.replace(/\/$/, '') : null; } catch { return null; }
}
export function compareProposal(proposal, campaigns) {
  const p = proposal.proposed_target;
  const result = { submissionId: proposal.id, campaignName: p.campaignName, mapName: p.mapName, challengeName: p.challengeName, proposalTarget: p, status: 'manual', reason: '' };
  const skip = reason => ({ ...result, reason });
  if (!gameBananaKey(p.gameBananaUrl)) return skip('缺少有效 GameBanana 链接');
  const packs = campaigns.filter(c => gameBananaKey(c.url) === gameBananaKey(p.gameBananaUrl));
  if (packs.length !== 1) return skip(packs.length ? 'GameBanana 对应多个地图包' : '未找到对应地图包');
  const campaign = packs[0];
  const maps = (campaign.maps ?? []).filter(m => normalize(m.name) === normalize(p.mapName));
  result.sourceCampaignId = campaign.id;
  result.sourceCampaignName = campaign.name;
  if (maps.length !== 1) return skip('地图名未唯一精确匹配');
  const map = maps[0];
  result.sourceMapId = map.id;
  if (map.is_archived || map.counts_for_id != null) return skip('地图已归档或关联其他统计目标');
  if (p.rules?.trim()) return skip('提案含额外规则，需要人工核对');
  const variant = String(p.challengeName).trim().toUpperCase();
  if (!['C', 'FC', 'C/FC'].includes(variant)) return skip('提案含限定或非标准挑战名，需要人工核对');
  const choices = (map.challenges ?? []).filter(c => !c.is_rejected && c.map_id === map.id && c.campaign_id == null);
  result.sourceChallenges = choices.map(c => ({ id: c.id, objective: c.objective?.name, label: c.label, description: c.description, variant: c.requires_fc ? 'FC' : c.has_fc ? 'C/FC' : 'C', difficulty: c.difficulty?.name }));
  const matches = choices.filter(c => ['Golden Berry', 'Silver Berry'].includes(c.objective?.name) && !c.label?.trim() && !c.description?.trim() && !c.is_arbitrary && ((c.requires_fc ? 'FC' : c.has_fc ? 'C/FC' : 'C') === variant || (!c.requires_fc && c.has_fc && ['C', 'FC'].includes(variant))));
  if (matches.length !== 1) return skip('挑战类型、目标或限定未唯一匹配');
  const challenge = matches[0];
  const targetType = challenge.requires_fc ? 'FC' : challenge.has_fc ? 'C/FC' : 'C';
  const tier = /^Tier ([123])$/.exec(challenge.difficulty?.name ?? '');
  if (!tier || challenge.difficulty.sort !== Number(tier[1])) return skip('挑战超过 Tier 3，或未定档/难度数据不一致');
  // 地图没有独立难度字段；存在更高难度的其他挑战时先交人工确认。
  if (choices.some(c => Number(c.difficulty?.sort) > 3)) return skip('同地图另有高于 Tier 3 的挑战');
  return { ...result, status: 'candidate', reason: '链接、地图名、挑战类型与难度一致', tier: ['low-std', 'mid-std', 'high-std'][Number(tier[1]) - 1], sourceChallengeId: challenge.id, targetType, targetChallengeName: targetType, sourceObjective: challenge.objective.name, addFcTag: variant === 'FC',
    sourceUrl: `${origin}/challenge/${challenge.id}`, covers: { campaign: `${origin}/embed/img/campaign_collage.php?id=${campaign.id}&scale=2`, map: `${origin}/img/map/${map.id}&scale=2` } };
}
async function getJson(path) {
  const response = await fetch(origin + '/api' + path, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`goldberries HTTP ${response.status}`);
  return response.json();
}
async function readCatalog() {
  const pool = new Pool({ connectionString: appConfig.database.url, max: 1, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const proposals = (await client.query("SELECT s.id,s.proposed_target FROM submission s JOIN player p ON p.id=s.player_id WHERE s.status='pending' AND s.challenge_id IS NULL AND s.proposed_target IS NOT NULL AND s.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY s.id")).rows;
    const campaigns = (await client.query('SELECT id,name,cn_name,game_banana_url,banner_key,deleted_at FROM campaign')).rows;
    const maps = (await client.query('SELECT id,campaign_id,name,cn_name,banner_key,deleted_at FROM map')).rows;
    const challenges = (await client.query('SELECT id,map_id,scope,name,type,tier_code,deleted_at FROM challenge')).rows;
    return { proposals, campaigns, maps, challenges };
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
}
export async function readGoldberriesCover(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const target = new URL(response.headers.get('location') ?? '', url);
    throw Object.assign(new Error(target.searchParams.get('id') === '0' ? '来源缺少封面，返回默认占位图' : '封面发生重定向，需要核对来源'), { code: target.searchParams.get('id') === '0' ? 'missing_cover' : 'cover_redirect' });
  }
  if (!response.ok) throw new Error(`封面 HTTP ${response.status}`);
  const parts = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 5 * 1024 * 1024) throw new Error('封面超过 5 MiB'); parts.push(chunk); }
  const bytes = Buffer.concat(parts); const image = detectImage(bytes);
  if (!image) throw new Error('封面不是支持的图片格式');
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height) throw new Error('封面无有效尺寸');
  return { url, contentType: image.type, bytes: size, width: metadata.width, height: metadata.height, buffer: bytes };
}

async function checkCover(url) {
  const { buffer, ...metadata } = await readGoldberriesCover(url);
  return { ...metadata, uploadPerformed: false };
}

/** 仅在来源明确返回缺图占位符时复用包封面；网络错误或未知跳转仍跳过。 */
export async function checkProposalCovers(covers, check = checkCover) {
  const campaign = await check(covers.campaign);
  let map;
  try { map = await check(covers.map); }
  catch (error) {
    if (error.code !== 'missing_cover') throw error;
    map = { ...campaign, fallback: 'campaign', originalUrl: covers.map };
  }
  return { campaign, map };
}

function localPlan(item, catalog) {
  const p = catalog.proposals.find(p => p.id === item.submissionId).proposed_target;
  const packs = catalog.campaigns.filter(c => gameBananaKey(c.game_banana_url) === gameBananaKey(p.gameBananaUrl) || [c.name, c.cn_name].some(n => n && normalize(n) === normalize(p.campaignName)));
  if (packs.length > 1 || packs.some(c => c.deleted_at)) return { ...item, status: 'manual', reason: '本站地图包重名、链接冲突或位于回收站' };
  const pack = packs[0];
  if (pack && gameBananaKey(pack.game_banana_url) && gameBananaKey(pack.game_banana_url) !== gameBananaKey(p.gameBananaUrl)) return { ...item, status: 'manual', reason: '本站同名地图包的 GameBanana 链接冲突' };
  const maps = pack ? catalog.maps.filter(m => m.campaign_id === pack.id && [m.name, m.cn_name].some(n => n && normalize(n) === normalize(p.mapName))) : [];
  if (maps.length > 1 || maps.some(m => m.deleted_at)) return { ...item, status: 'manual', reason: '本站地图重名或位于回收站' };
  const map = maps[0];
  const challenges = map ? catalog.challenges.filter(c => c.map_id === map.id && c.scope === 'map' && [item.targetChallengeName, p.challengeName].some(n => normalize(c.name) === normalize(n))) : [];
  if (challenges.length > 1 || challenges.some(c => c.deleted_at || c.tier_code !== item.tier || c.type !== item.targetType)) return { ...item, status: 'manual', reason: '本站已有挑战存在难度、类型、重名或回收冲突' };
  return { ...item, plan: { campaign: pack ? `复用 #${pack.id}` : '新建', map: map ? `复用 #${map.id}` : '新建', challenge: challenges.length ? `复用 #${challenges[0].id}` : '新建', campaignCoverExists: !!pack?.banner_key, mapCoverExists: !!map?.banner_key, submission: '新挑战建档后按 Std 规则处理；本轮不写入', coverPolicy: '本轮只校验新建对象所需封面，不上传' } };
}
/** sourceById 仅供本机复核已下载快照；群指令始终查询实时来源。 */
export async function runGoldberriesDryRun({ sourceById, verifyCovers = true } = {}) {
  const catalog = await readCatalog(); const items = []; let next = 0;
  async function worker() {
    while (next < catalog.proposals.length) {
      const proposal = catalog.proposals[next++];
      try {
        let campaigns;
        if (sourceById) { const source = sourceById.get(proposal.id); if (!source || source.error) throw new Error(source?.error ?? '快照缺少此提案'); campaigns = source.campaigns; }
        else {
          if (!gameBananaKey(proposal.proposed_target.gameBananaUrl)) { items.push(compareProposal(proposal, [])); continue; }
          const found = await getJson('/campaign/find-by-gb-url?gamebanana_url=' + encodeURIComponent(proposal.proposed_target.gameBananaUrl));
          campaigns = []; for (const c of found) { if (!Number.isSafeInteger(c.id)) throw new Error('来源 ID 无效'); campaigns.push(await getJson(`/campaign?id=${c.id}&maps=true&challenges=true`)); }
        }
        let item = compareProposal(proposal, campaigns);
        if (item.status === 'candidate') item = localPlan(item, catalog);
        if (item.status === 'candidate' && verifyCovers) {
          try { item.coverChecks = await checkProposalCovers(item.covers); }
          catch (e) { item.status = 'manual'; item.reason = e.message; }
        }
        items.push(item);
      } catch (error) { items.push({ submissionId: proposal.id, mapName: proposal.proposed_target.mapName, status: 'error', reason: error.message }); }
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker)); items.sort((a, b) => a.submissionId - b.submissionId);
  return { mode: 'dry-run', checkedAt: new Date().toISOString(), total: items.length, candidates: items.filter(i => i.status === 'candidate').length, manual: items.filter(i => i.status === 'manual').length, errors: items.filter(i => i.status === 'error').length, databaseWrites: 0, uploads: 0, ossConfigured: !!appConfig.oss, items };
}
export function formatDryRun(report) {
  const heading = `新挑战审核 · dry-run\n待处理 ${report.total}；严格匹配且封面可读 ${report.candidates}；待确认 ${report.manual}；查询失败 ${report.errors}\n未建档、未审核、未上传。C/FC 按来源建档；银莓纳入；缺地图封面时复用包封面。`;
  const pages = []; let page = heading;
  for (const item of report.items) {
    const line = `\n#${item.submissionId} ${item.mapName} ${item.challengeName ?? ''}：${item.status === 'candidate' ? `${item.tier} ${item.targetType}；包${item.plan.campaign}、图${item.plan.map}、挑战${item.plan.challenge}；${item.coverChecks?.map?.fallback ? "地图复用包封面" : "封面校验通过"}${item.addFcTag ? "；记录加 FC 标签" : ""}` : item.reason}`;
    if (page.length + line.length > 1600) { pages.push(page); page = '新挑战审核 · dry-run（续）'; }
    page += line;
  }
  pages.push(page); return pages;
}

/** 宿主提供管理员鉴权及回复出口；默认不允许未配置权限的调用。 */
export function createReviewNewChallengesCommand({ authorize, send, run = runGoldberriesDryRun, apply = async options => (await import('./goldberries-apply.mjs')).runGoldberriesApply(options) }) {
  if (typeof authorize !== 'function' || typeof send !== 'function') throw new Error('审核指令必须配置管理员鉴权与回复出口');
  let busy = false;
  return async event => {
    if (event?.post_type !== 'message' || event.message_type !== 'group' || String(event.user_id) === String(event.self_id)) return false;
    const { plainText } = await import('./commands.mjs');
    const text = plainText(event);
    if (!/^\/审核新挑战(?:\s|$)/u.test(text)) return false;
    const groupId = String(event.group_id), userId = String(event.user_id);
    if (!await authorize({ groupId, userId })) return true;
    const args = text.slice('/审核新挑战'.length).trim();
    if (args && args !== 'dry-run') { await send(groupId, '用法：/审核新挑战（正式执行），或 /审核新挑战 dry-run（只读预演）。'); return true; }
    if (busy) { await send(groupId, '已有新挑战比对或导入正在进行，请等待结果。'); return true; }
    busy = true;
    const dryRun = args === 'dry-run';
    try {
      await send(groupId, dryRun ? '开始比对 pending 新挑战（dry-run），不建档、不审核、不上传。' : '开始审核新挑战：符合条件的提案将建档、上传封面，并按 Std 规则自动通过；不匹配的保留 pending。');
      if (dryRun) {
        const report = await run();
        for (const message of formatDryRun(report)) await send(groupId, message);
      } else {
        const { formatApplyReport } = await import('./goldberries-apply.mjs');
        const report = await apply({
          actor: { displayName: `QQ 管理员 ${userId}` },
          authorize: () => authorize({ groupId, userId }),
          onProgress: message => send(groupId, message),
        });
        for (const message of formatApplyReport(report)) await send(groupId, message);
      }
    } catch (error) {
      await send(groupId, dryRun ? `预演未完成：${error.message}。未写库或上传。` : `执行中断：${error.message}。可能已有部分项目完成；可重新执行，已处理记录不会重复建档。`);
    }
    finally { busy = false; }
    return true;
  };
}
