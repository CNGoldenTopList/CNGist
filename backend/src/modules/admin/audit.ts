/** 审计日志的唯一写入口，以及写审计时用得到的命名与差异工具。 */
import { eq } from "drizzle-orm";
import type { db } from "../../db/client";
import { auditLog, campaign, challenge, map, player, submission } from "../../db/schema/index";
import type { AdminReviewState } from "../../../../shared/src/admin";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 动作发起者。审计里记显示名，拿不到才退回账户编号。 */
export type Actor = { id: number; displayName: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function shown(value: unknown) {
  if (value === null || value === undefined || value === "") return "未填写";
  if (Array.isArray(value)) return value.join("、") || "未填写";
  return String(value);
}

/** 只保留真正发生变化的字段，避免审计页被“a → a”淹没。顺序类字段本身就用 */
export function diffLines(rows: Array<[string, unknown, unknown]>) {
  return rows.filter(([, before, after]) => shown(before) !== shown(after))
    .flatMap(([label, before, after]) => {
      const from = shown(before);
      const to = shown(after);
      if (from.includes("→") || to.includes("→")) return [`- ${label}：`, `  原：${from}`, `  现：${to}`];
      return [`- ${label}：${from} → ${to}`];
    });
}

export async function writeAudit(tx: Tx, actor: Actor, type: string, detail: string) {
  await tx.insert(auditLog).values({
    type: clean(type, 300),
    detail: clean(detail, 20_000),
    actor: clean(actor.displayName, 300) || String(actor.id),
  });
}

/** 「地图名 · 挑战名」，查不到就退回编号。 */
export async function challengeLabel(tx: Tx, challengeId: number) {
  const rows = await tx.select({ name: challenge.name, mapName: map.name, campaignName: campaign.name })
    .from(challenge)
    .leftJoin(map, eq(map.id, challenge.mapId))
    .leftJoin(campaign, eq(campaign.id, challenge.campaignId))
    .where(eq(challenge.id, challengeId)).limit(1);
  const row = rows[0];
  if (!row) return String(challengeId);
  return [row.mapName ?? row.campaignName, row.name].filter(Boolean).join(" · ");
}

/** 「玩家名 · 地图名 · 挑战名」。审计里指一条记录就该用这个，不要写裸 id。 */
export async function submissionLabel(tx: Tx, submissionId: number) {
  const rows = await tx.select({ playerName: player.name, challengeId: submission.challengeId })
    .from(submission)
    .leftJoin(player, eq(player.id, submission.playerId))
    .where(eq(submission.id, submissionId)).limit(1);
  const row = rows[0];
  if (!row) return String(submissionId);
  const label = row.challengeId ? await challengeLabel(tx, row.challengeId) : "新地图或挑战提案";
  return [row.playerName, label].filter(Boolean).join(" · ");
}

/** 审核结论的类型名。两条审核路径都用它，别再各拼各的 —— */
export function reviewAuditType(status: AdminReviewState) {
  if (status === "accepted") return "审核通过";
  if (status === "rejected") return "审核拒绝";
  if (status === "hidden") return "审核隐藏";
  return "退回待审核";
}
