/** trash 模块。 */
import { commandTransaction } from "./transaction";
import { entityId } from "../../../../shared/src/entity-id";
import { lockPlayerNames } from "../players/player-names";
import { eq, sql } from "drizzle-orm";
import { campaign, challenge, map, player, submission, trashItem } from "../../db/schema/index";
import type { TrashItem } from "../../../../shared/src/admin";
import { challengeLabel, writeAudit, type Tx } from "./audit";
import { detachPlayer } from "../players/commands";
import { Admin, Result, clean, failure, done } from "./common";

export const TRASH_KINDS: TrashItem["kind"][] = ["record", "campaign", "map", "challenge", "player"];

export async function setTargetDeleted(tx: Tx, kind: TrashItem["kind"], targetId: number, deletedAt: Date | null) {
  if (kind === "player") {
    await tx.update(player).set({ deletedAt }).where(eq(player.id, targetId));
    if (deletedAt) await detachPlayer(tx, targetId);
  }
  if (kind === "record") await tx.update(submission).set({ deletedAt }).where(eq(submission.id, targetId));
  if (kind === "campaign") await tx.update(campaign).set({ deletedAt }).where(eq(campaign.id, targetId));
  if (kind === "map") await tx.update(map).set({ deletedAt }).where(eq(map.id, targetId));
  if (kind === "challenge") await tx.update(challenge).set({ deletedAt }).where(eq(challenge.id, targetId));
}

export async function trashLabel(tx: Tx, kind: TrashItem["kind"], targetId: number) {
  if (kind === "player") {
    const [row] = await tx.select().from(player).where(eq(player.id, targetId)).for("update");
    return row?.name ?? null;
  }
  if (kind === "record") {
    const rows = await tx.select({ challengeId: submission.challengeId, playerName: player.name }).from(submission)
      .leftJoin(player, eq(player.id, submission.playerId)).where(eq(submission.id, targetId)).limit(1);
    if (!rows[0]) return null;
    const label = rows[0].challengeId ? await challengeLabel(tx, rows[0].challengeId) : "新地图或挑战提案";
    return `${rows[0].playerName ?? "未知玩家"} · ${label}`;
  }
  if (kind === "campaign") {
    const rows = await tx.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, targetId)).limit(1);
    return rows[0]?.name ?? null;
  }
  if (kind === "map") {
    const rows = await tx.select({ name: map.name }).from(map).where(eq(map.id, targetId)).limit(1);
    return rows[0]?.name ?? null;
  }
  const rows = await tx.select({ id: challenge.id }).from(challenge).where(eq(challenge.id, targetId)).limit(1);
  return rows[0] ? await challengeLabel(tx, targetId) : null;
}

export async function moveToTrash(admin: Admin, input: { kind?: unknown; targetId?: unknown }): Promise<Result> {
  const kind = clean(input.kind, 32) as TrashItem["kind"];
  const targetId = entityId(input.targetId);
  if (!TRASH_KINDS.includes(kind) || !targetId) return failure("回收站条目类型无效。");
  return commandTransaction(async (tx) => {
    if (kind === "player") await lockPlayerNames(tx);
    const label = await trashLabel(tx, kind, targetId);
    if (!label) return failure("目标不存在。", 404);
    await setTargetDeleted(tx, kind, targetId, new Date());
    await tx.insert(trashItem).values({ kind, targetId, label }).onConflictDoNothing();
    await writeAudit(tx, admin, "移入回收站", `${kind} · ${label}`);
    return done(undefined);
  });
}

export async function restoreFromTrash(admin: Admin, trashId: number): Promise<Result> {
  return commandTransaction(async (tx) => {
    await lockPlayerNames(tx);
    const rows = await tx.select().from(trashItem).where(eq(trashItem.id, trashId)).for("update");
    const item = rows[0];
    if (!item) return failure("回收站条目不存在。", 404);
    await setTargetDeleted(tx, item.kind as TrashItem["kind"], item.targetId, null);
    await tx.delete(trashItem).where(eq(trashItem.id, trashId));
    await writeAudit(tx, admin, "回收站恢复", `${item.kind} · ${item.label}`);
    return done(undefined);
  });
}

export async function confirmTrashDeletion(admin: Admin, trashId: number): Promise<Result> {
  if (admin.role !== "super_admin") return failure("需要超级管理员权限。", 403);
  return commandTransaction(async (tx) => {
    const locked = await tx.execute<{ id: number; kind: string; label: string }>(
      sql`select id, kind, label from trash_item where id = ${trashId} for update`,
    );
    const item = locked.rows[0];
    if (!item) return failure("回收站条目不存在。", 404);
    await tx.delete(trashItem).where(eq(trashItem.id, trashId));
    await writeAudit(tx, admin, "确认删除", `${item.label}\n- 目标保持删除状态\n- 操作者账户：${admin.id}`);
    return done(undefined);
  });
}
