import { and, eq, isNull } from "drizzle-orm";
import { account, player } from "../../db/schema";
import { commandTransaction } from "../admin/transaction";
import { writeAudit } from "../admin/audit";
import { fail, type ApiErrorCode } from "../../../../shared/src/api-errors";

const statusLabels: Record<string, string> = { unasked: "未询问", unreplied: "未回复", normal: "正常", unwilling: "不愿意上榜", blocked: "榜拒绝接受" };
const reject = (code: ApiErrorCode, status: number) => ({ ...fail(code), status });

export async function updateOwnPlayerStatus(accountId: number, playerId: number, status: unknown) {
  if (status !== "normal" && status !== "unwilling") return reject("playerStatusInvalid", 400);
  return commandTransaction(async tx => {
    const [owner] = await tx.select().from(account).where(eq(account.id, accountId)).for("share");
    if (!owner || owner.status !== "active") return reject("signInRequired", 401);
    if (owner.claimedPlayerId !== playerId) return reject("playerStatusSelfOnly", 403);
    const [target] = await tx.select().from(player).where(and(eq(player.id, playerId), isNull(player.deletedAt))).for("update");
    if (!target) return reject("playerMissing", 404);
    if (target.status === "blocked") return reject("playerBlocked", 403);
    if (target.status !== status) {
      await tx.update(player).set({ status }).where(eq(player.id, playerId));
      await writeAudit(tx, owner, "玩家修改上榜状态", `${target.name}：${statusLabels[target.status] ?? target.status} → ${statusLabels[status]}`);
    }
    return { ok: true as const, status };
  });
}
