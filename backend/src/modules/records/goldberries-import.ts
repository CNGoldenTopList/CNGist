/** 由已鉴权的 QQ 指令调用；不暴露 HTTP 写入口。图片在事务前上传，目录与记录整体提交。 */
import { and, eq, sql } from "drizzle-orm";
import { campaign, map, challenge, submission, submissionTag, player, imageAsset } from "../../db/schema";
import { writeAudit, type Tx } from "../admin/audit";
import { FC_TAG_COLOR, tagIdentity } from "../../../../shared/src/review-tags";

export type GoldberriesPlan = {
  submissionId: number;
  proposalTarget: Record<string, unknown>;
  campaignName: string; mapName: string; challengeName: string;
  targetChallengeName: string; targetType: "C" | "FC" | "C/FC";
  tier: "low-std" | "mid-std" | "high-std";
  sourceUrl: string; sourceObjective: string;
  addFcTag: boolean;
};
export type ImportedCover = { key: string; contentType: string; bytes: number; source: string };
export type ImportedCovers = { campaign: ImportedCover; map: ImportedCover; fallback?: boolean };
const norm = (value: unknown) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
function gbKey(value: unknown) {
  try { const u = new URL(String(value)); return u.hostname === "gamebanana.com" && /^\/(mods|wips)\/\d+\/?$/.test(u.pathname) ? u.pathname.replace(/\/$/, "") : null; } catch { return null; }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, JSON.parse(canonical(v))])));
  return JSON.stringify(value);
}
function skip(reason: string) { return { status: "skipped" as const, reason }; }

/** 事务必须由调用者开启。表锁只覆盖本地 SQL，防止与网页建档/审核并发产生重复或覆盖。 */
export async function importGoldberriesProposal(tx: Tx, plan: GoldberriesPlan, covers: ImportedCovers, actor: { displayName: string }) {
  if (!["low-std", "mid-std", "high-std"].includes(plan.tier) || !["C", "FC", "C/FC"].includes(plan.targetType)
    || plan.targetChallengeName !== plan.targetType || !["Golden Berry", "Silver Berry"].includes(plan.sourceObjective)
    || !/^https:\/\/goldberries\.net\/challenge\/\d+$/.test(plan.sourceUrl)
    || !actor.displayName?.trim() || !gbKey(plan.proposalTarget.gameBananaUrl)) throw new Error("导入计划无效");
  await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
  await tx.execute(sql`LOCK TABLE campaign, map, challenge, player, submission, submission_tag IN SHARE ROW EXCLUSIVE MODE`);
  const current = (await tx.select().from(submission).where(eq(submission.id, plan.submissionId)).limit(1))[0];
  if (!current || current.status !== "pending" || current.challengeId !== null || current.deletedAt || !current.proposedTarget) return skip("提案已处理、撤回或删除");
  if (canonical(current.proposedTarget) !== canonical(plan.proposalTarget)) return skip("提案内容已变化，请重新比对");
  const p = current.proposedTarget as Record<string, unknown>;
  if (p.campaignName !== plan.campaignName || p.mapName !== plan.mapName || p.challengeName !== plan.challengeName
    || plan.addFcTag !== (String(p.challengeName).trim().toUpperCase() === "FC")) throw new Error("提案与导入计划不一致");
  const owner = (await tx.select().from(player).where(eq(player.id, current.playerId)).limit(1))[0];
  if (!owner || owner.deletedAt) return skip("玩家已回收");
  const packs = (await tx.select().from(campaign)).filter(c => gbKey(c.gameBananaUrl) === gbKey(p.gameBananaUrl)
    || [c.name, c.cnName].some(n => n && norm(n) === norm(p.campaignName)));
  if (packs.length > 1 || packs.some(c => c.deletedAt)) return skip("地图包重名、链接冲突或已回收");
  let pack = packs[0];
  if (pack && gbKey(pack.gameBananaUrl) && gbKey(pack.gameBananaUrl) !== gbKey(p.gameBananaUrl)) return skip("同名地图包发布链接冲突");
  const maps = pack ? (await tx.select().from(map).where(eq(map.campaignId, pack.id))).filter(m => [m.name, m.cnName].some(n => n && norm(n) === norm(p.mapName))) : [];
  if (maps.length > 1 || maps.some(m => m.deletedAt)) return skip("地图重名或已回收");
  let targetMap = maps[0];
  const challenges = targetMap ? (await tx.select().from(challenge).where(and(eq(challenge.mapId, targetMap.id), eq(challenge.scope, "map"))))
    .filter(c => [plan.targetChallengeName, plan.challengeName].some(n => norm(c.name) === norm(n))) : [];
  if (challenges.length > 1 || challenges.some(c => c.deletedAt || c.type !== plan.targetType || c.tierCode !== plan.tier)) return skip("已有挑战的难度、类型或回收状态冲突");
  let target = challenges[0];
  const created = { campaign: !pack, map: !targetMap, challenge: !target };
  const addedCovers = { campaign: !pack?.banner, map: !targetMap?.banner };
  const usedKeys = new Set<string>();
  async function indexCover(cover: ImportedCover) {
    if (!cover?.key || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(cover.contentType)
      || !Number.isInteger(cover.bytes) || cover.bytes < 1 || cover.bytes > 5 * 1024 * 1024) throw new Error("上传图片索引无效");
    if (!usedKeys.has(cover.key)) await tx.insert(imageAsset).values({ objectKey: cover.key, contentType: cover.contentType, bytes: cover.bytes });
    usedKeys.add(cover.key);
    return cover.key;
  }
  if (!pack) {
    pack = (await tx.insert(campaign).values({ name: plan.campaignName, shortName: plan.campaignName,
      gameBananaUrl: String(p.gameBananaUrl), url: String(p.gameBananaUrl), banner: await indexCover(covers.campaign), bannerSource: covers.campaign.source }).returning())[0];
  } else if (!pack.banner) {
    await tx.update(campaign).set({ banner: await indexCover(covers.campaign), bannerSource: covers.campaign.source }).where(eq(campaign.id, pack.id));
  }
  if (!targetMap) {
    targetMap = (await tx.insert(map).values({ campaignId: pack.id, name: plan.mapName, primaryTier: plan.tier,
      banner: await indexCover(covers.map), bannerSource: covers.map.source }).returning())[0];
  } else if (!targetMap.banner) {
    await tx.update(map).set({ banner: await indexCover(covers.map), bannerSource: covers.map.source }).where(eq(map.id, targetMap.id));
  }
  if (!target) target = (await tx.insert(challenge).values({ scope: "map", mapId: targetMap.id, name: plan.targetChallengeName,
    type: plan.targetType, tierCode: plan.tier }).returning())[0];
  let fcTagAdded = false;
  if (plan.addFcTag) {
    const tags = await tx.select().from(submissionTag).where(eq(submissionTag.submissionId, current.id));
    if (!tags.some(t => t.kind === "badge" && tagIdentity(t.text) === "fc")) {
      await tx.insert(submissionTag).values({ submissionId: current.id, kind: "badge", text: "FC", color: FC_TAG_COLOR });
      fcTagAdded = true;
    }
  }
  // Std 是未经人工核实的个人记录，不伪造审核人或审核时间，不改写录像/标签/同图其他记录。
  await tx.update(submission).set({ challengeId: target.id, proposedTarget: null, status: "accepted", reviewedBy: null, reviewedAt: null,
    reviewingBy: null, reviewingNote: null, reviewingAt: null }).where(eq(submission.id, current.id));
  await writeAudit(tx, actor, "自动建档新挑战", `${plan.campaignName} · ${plan.mapName} · ${plan.targetType}\n`
    + `- 来源：${plan.sourceUrl}（${plan.sourceObjective}）\n- 难度：${plan.tier}\n`
    + `- 地图包：${created.campaign ? "新建" : "复用"} #${pack.id}；地图：${created.map ? "新建" : "复用"} #${targetMap.id}；挑战：${created.challenge ? "新建" : "复用"} #${target.id}\n`
    + `- 封面：包${addedCovers.campaign ? "补充" : "保留"}，图${addedCovers.map ? (covers.fallback ? "复用包封面" : "补充") : "保留"}\n`
    + `- ${owner.name} 的记录 #${current.id} 按 Std 规则自动通过，未人工验片${fcTagAdded ? "；补充 FC 标签" : ""}`);
  return { status: "applied" as const, submissionId: current.id, campaignId: pack.id, mapId: targetMap.id, challengeId: target.id,
    created, addedCovers, fcTagAdded, usedKeys: [...usedKeys], mapCoverFallback: !!covers.fallback };
}
