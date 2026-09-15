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
  resolvedGameBananaUrl?: string;
  packEvidence?: { kind: "proposal" | "submission" | "campaign"; submissionId?: number; submittedBy?: number; campaignId?: number };
  sourceDifficulty?: string;
  sourceDescription?: string;
  sourceLabel?: string;
  matchEvidence?: string;
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
function explicitFc(name: unknown) {
  const value = String(name).trim().toUpperCase();
  return value === "FC" || /(?:\[|［)FC(?:\]|］)/.test(value) || /\s+FC$/.test(value);
}
function skip(reason: string) { return { status: "skipped" as const, reason }; }

/** 事务必须由调用者开启。表锁只覆盖本地 SQL，防止与网页建档/审核并发产生重复或覆盖。 */
export async function importGoldberriesProposal(tx: Tx, plan: GoldberriesPlan, covers: ImportedCovers, actor: { displayName: string }) {
  if (!["low-std", "mid-std", "high-std"].includes(plan.tier) || !["C", "FC", "C/FC"].includes(plan.targetType)
    || !plan.targetChallengeName?.trim() || !plan.sourceObjective?.trim()
    || !/^https:\/\/goldberries\.net\/challenge\/\d+$/.test(plan.sourceUrl)
    || !actor.displayName?.trim() || !gbKey(plan.resolvedGameBananaUrl ?? plan.proposalTarget.gameBananaUrl)) throw new Error("导入计划无效");
  if (plan.sourceDifficulty !== undefined) {
    const expected = ({ "Tier 1": "low-std", "Tier 2": "mid-std", "Tier 3": "high-std", Untiered: "low-std" } as Record<string, string>)[plan.sourceDifficulty];
    if (expected !== plan.tier) throw new Error("来源难度不允许自动归档");
  }
  await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
  await tx.execute(sql`LOCK TABLE campaign, map, challenge, player, submission, submission_tag IN SHARE ROW EXCLUSIVE MODE`);
  const current = (await tx.select().from(submission).where(eq(submission.id, plan.submissionId)).limit(1))[0];
  if (!current || current.status !== "pending" || current.challengeId !== null || current.deletedAt || !current.proposedTarget) return skip("提案已处理、撤回或删除");
  if (canonical(current.proposedTarget) !== canonical(plan.proposalTarget)) return skip("提案内容已变化，请重新比对");
  const p = current.proposedTarget as Record<string, unknown>;
  if (p.campaignName !== plan.campaignName || p.mapName !== plan.mapName || p.challengeName !== plan.challengeName
    || plan.addFcTag !== explicitFc(p.challengeName)
    || plan.targetChallengeName !== (["C", "FC", "C/FC"].includes(String(p.challengeName).trim().toUpperCase()) ? plan.targetType : p.challengeName)) throw new Error("提案与导入计划不一致");
  const sourceLink = String(plan.resolvedGameBananaUrl ?? p.gameBananaUrl);
  const sourceKey = gbKey(sourceLink);
  if (p.gameBananaUrl) {
    if (gbKey(p.gameBananaUrl) !== sourceKey) return skip("申请发布链接与计划不一致");
  } else if (plan.packEvidence?.kind === "submission") {
    const evidence = plan.packEvidence;
    if (!current.submittedBy || current.submittedBy !== evidence.submittedBy || !evidence.submissionId) return skip("关联提交账户不一致");
    const sibling = (await tx.select().from(submission).where(eq(submission.id, evidence.submissionId)).limit(1))[0];
    if (!sibling || sibling.deletedAt || sibling.submittedBy !== current.submittedBy) return skip("关联申请已失效");
    if (sibling.proposedTarget) {
      const other = sibling.proposedTarget as Record<string, unknown>;
      if (sibling.status !== "pending" || norm(other.campaignName) !== norm(p.campaignName) || gbKey(other.gameBananaUrl) !== sourceKey) return skip("关联申请的地图包已变化");
    } else {
      // A preceding item in this same batch may already have archived the link-bearing proposal.
      if (sibling.status !== "accepted" || !sibling.challengeId) return skip("关联申请已处理但无法确认地图包");
      const linked = (await tx.select({ pack: campaign }).from(challenge).innerJoin(map, eq(challenge.mapId, map.id))
        .innerJoin(campaign, eq(map.campaignId, campaign.id)).where(and(eq(challenge.id, sibling.challengeId), eq(challenge.scope, "map"))).limit(1))[0]?.pack;
      if (!linked || linked.deletedAt || norm(linked.name) !== norm(p.campaignName) || gbKey(linked.gameBananaUrl) !== sourceKey) return skip("已归档关联申请的地图包不一致");
    }
  } else if (plan.packEvidence?.kind === "campaign") {
    const linked = (await tx.select().from(campaign).where(eq(campaign.id, plan.packEvidence.campaignId ?? -1)).limit(1))[0];
    if (!linked || linked.deletedAt || ![linked.name, linked.cnName].some(n => n && norm(n) === norm(p.campaignName)) || gbKey(linked.gameBananaUrl) !== sourceKey) return skip("本站地图包关联证据失效");
  } else return skip("缺少地图包链接关联证据");
  if (current.submittedBy) {
    const siblings = await tx.select().from(submission).where(and(eq(submission.submittedBy, current.submittedBy), eq(submission.status, "pending")));
    if (siblings.some(s => {
      const other = s.proposedTarget as Record<string, unknown> | null;
      return !s.deletedAt && other && norm(other.campaignName) === norm(p.campaignName) && other.gameBananaUrl && gbKey(other.gameBananaUrl) !== sourceKey;
    })) return skip("同一提交账户的同名地图包出现链接冲突");
  }
  const owner = (await tx.select().from(player).where(eq(player.id, current.playerId)).limit(1))[0];
  if (!owner || owner.deletedAt) return skip("玩家已回收");
  const packs = (await tx.select().from(campaign)).filter(c => gbKey(c.gameBananaUrl) === sourceKey
    || [c.name, c.cnName].some(n => n && norm(n) === norm(p.campaignName)));
  if (packs.length > 1 || packs.some(c => c.deletedAt)) return skip("地图包重名、链接冲突或已回收");
  let pack = packs[0];
  if (pack && gbKey(pack.gameBananaUrl) && gbKey(pack.gameBananaUrl) !== sourceKey) return skip("同名地图包发布链接冲突");
  const maps = pack ? (await tx.select().from(map).where(eq(map.campaignId, pack.id))).filter(m => [m.name, m.cnName].some(n => n && norm(n) === norm(p.mapName))) : [];
  if (maps.length > 1 || maps.some(m => m.deletedAt)) return skip("地图重名或已回收");
  let targetMap = maps[0];
  const challenges = targetMap ? (await tx.select().from(challenge).where(and(eq(challenge.mapId, targetMap.id), eq(challenge.scope, "map"))))
    .filter(c => [plan.targetChallengeName, plan.challengeName].some(n => norm(c.name) === norm(n))) : [];
  if (challenges.length > 1 || challenges.some(c => c.deletedAt || c.type !== plan.targetType || c.tierCode !== plan.tier || norm(c.description) !== norm(p.rules || plan.sourceDescription || ""))) return skip("已有挑战的难度、类型或回收状态冲突");
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
      gameBananaUrl: sourceLink, url: sourceLink, banner: await indexCover(covers.campaign), bannerSource: covers.campaign.source }).returning())[0];
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
    type: plan.targetType, tierCode: plan.tier, description: String(p.rules || plan.sourceDescription || "") }).returning())[0];
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
  await writeAudit(tx, actor, "自动建档新挑战", `${plan.campaignName} · ${plan.mapName} · ${plan.targetChallengeName}\n`
    + `- 来源：${plan.sourceUrl}（${plan.sourceObjective}；${plan.sourceDifficulty ?? "旧严格匹配"}）\n- 难度：${plan.tier}\n`
    + `- 地图包链接：${sourceLink}；依据：${plan.packEvidence?.kind ?? "proposal"}\n`
    + `- 来源限定：${plan.sourceLabel ?? ""}；${plan.sourceDescription ?? ""}；匹配依据：${plan.matchEvidence ?? "严格匹配"}\n`
    + `- 地图包：${created.campaign ? "新建" : "复用"} #${pack.id}；地图：${created.map ? "新建" : "复用"} #${targetMap.id}；挑战：${created.challenge ? "新建" : "复用"} #${target.id}\n`
    + `- 封面：包${addedCovers.campaign ? "补充" : "保留"}，图${addedCovers.map ? (covers.fallback ? "复用包封面" : "补充") : "保留"}\n`
    + `- ${owner.name} 的记录 #${current.id} 按 Std 规则自动通过，未人工验片${fcTagAdded ? "；补充 FC 标签" : ""}`);
  return { status: "applied" as const, submissionId: current.id, campaignId: pack.id, mapId: targetMap.id, challengeId: target.id,
    created, addedCovers, fcTagAdded, usedKeys: [...usedKeys], mapCoverFallback: !!covers.fallback };
}
