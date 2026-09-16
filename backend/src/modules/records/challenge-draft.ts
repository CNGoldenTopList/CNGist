import { isChallengeType } from "../../../../shared/src/types";
import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { campaign, map, challenge, submission, player } from "../../db/schema";
import { writeAudit, type Tx } from "../admin/audit";
import type { Admin } from "../admin/common";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import { validGameBananaUrl } from "../../../../shared/src/gamebanana";
import type { ChallengeDraft } from "../../../../shared/src/challenge-draft";
import { gameBananaKey } from "./goldberries-match";
export const norm = (v: unknown) => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export const proposalToken = (p: unknown) => createHash("sha256").update(JSON.stringify(p, (_key,value) =>
  value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value)).digest("hex");
function invalid(message: string): never { throw Object.assign(new Error(message), { statusCode: 409 }); }
export async function createChallengeDraft(tx: Tx, admin: Admin, id: number, token: unknown, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("请补全建档资料。");
  const d = raw as ChallengeDraft;
  for (const key of ["campaignName", "mapName", "challengeName"] as const) if (typeof d[key] !== "string" || !d[key].trim() || d[key].length > 300) invalid("请填写地图包、地图和挑战名称（最多 300 字）。");
  if (typeof d.gameBananaUrl !== "string" || !validGameBananaUrl(d.gameBananaUrl)) invalid("请补全有效的 GameBanana 地图包链接。");
  if (!d.tier || !isDifficultyCode(d.tier)) invalid("请选择挑战难度，可选择未定档。");
  if (!isChallengeType(d.type)) invalid("请选择挑战类型。");
  if (typeof d.rules !== "string" || d.rules.length > 4000) invalid("挑战规则最多 4000 字。");
  for (const value of [d.campaignId, d.mapId]) if (value != null && (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)) invalid("归属编号无效。");
  await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
  await tx.execute(sql`LOCK TABLE campaign, map, challenge, player, submission IN SHARE ROW EXCLUSIVE MODE`);
  const current = (await tx.select().from(submission).where(eq(submission.id, id)).limit(1))[0];
  if (!current || current.deletedAt || current.status !== "pending" || current.challengeId || !current.proposedTarget) invalid("提案已处理、撤回或删除。");
  if (proposalToken(current.proposedTarget) !== token) invalid("提案已变化，请重新打开预览。");
  const owner = (await tx.select().from(player).where(eq(player.id, current.playerId)).limit(1))[0];
  if (!owner || owner.deletedAt) invalid("玩家已回收。");
  const packs = (await tx.select().from(campaign).where(isNull(campaign.deletedAt))).filter(c => d.campaignId != null ? c.id === d.campaignId : gameBananaKey(c.gameBananaUrl) === gameBananaKey(d.gameBananaUrl) || [c.name,c.cnName].some(n => n && norm(n) === norm(d.campaignName)));
  if (packs.length > 1 || packs.some(c => c.deletedAt) || d.campaignId != null && !packs.length) invalid("地图包重名、已回收或不存在，请选择现有地图包。");
  let pack = packs[0];
  if (pack?.gameBananaUrl && gameBananaKey(pack.gameBananaUrl) !== gameBananaKey(d.gameBananaUrl)) invalid("所选地图包链接不一致，请核对链接。");
  if (d.mapId != null && !pack) invalid("现有地图必须属于现有地图包。");
  const maps = pack ? (await tx.select().from(map).where(and(eq(map.campaignId, pack.id), isNull(map.deletedAt)))).filter(m => d.mapId != null ? m.id === d.mapId : [m.name,m.cnName].some(n => n && norm(n) === norm(d.mapName))) : [];
  if (maps.length > 1 || maps.some(m => m.deletedAt) || d.mapId != null && !maps.length) invalid("地图重名、已回收或不属于所选地图包。");
  let targetMap = maps[0];
  const targets = targetMap ? (await tx.select().from(challenge).where(and(eq(challenge.mapId,targetMap.id),eq(challenge.scope,"map"),isNull(challenge.deletedAt)))).filter(c => norm(c.name) === norm(d.challengeName)) : [];
  if (targets.length > 1 || targets.some(c => c.deletedAt || c.type !== d.type || c.tierCode !== d.tier || norm(c.description) !== norm(d.rules))) invalid("已有同名挑战的类型、难度或规则不同，请核对后直接选择该挑战或使用不同名称。");
  let target = targets[0];
  const created = { campaign: !pack, map: !targetMap, challenge: !target };
  if (!pack) pack = (await tx.insert(campaign).values({ name:d.campaignName.trim(),shortName:d.campaignName.trim(),gameBananaUrl:d.gameBananaUrl,url:d.gameBananaUrl }).returning())[0];
  if (!targetMap) targetMap = (await tx.insert(map).values({ campaignId:pack.id,name:d.mapName.trim(),primaryTier:d.tier }).returning())[0];
  if (!target) target = (await tx.insert(challenge).values({ scope:"map",mapId:targetMap.id,name:d.challengeName.trim(),type:d.type,tierCode:d.tier,description:d.rules.trim() }).returning())[0];
  await writeAudit(tx,admin,"预览确认建立挑战",`${pack.name} · ${targetMap.name} · ${target.name}\n- 管理员确认资料：${JSON.stringify(d)}\n- 新建项目：${JSON.stringify(created)}\n- 提案 #${id} 保留待审核`);
  return { campaignId:pack.id,mapId:targetMap.id,challengeId:target.id };
}
