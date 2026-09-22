import { and, eq, isNull, sql } from "drizzle-orm";
import { entityId } from "../../../../../shared/src/entity-id";
import { db, pool } from "../../../db/client";
import { player } from "../../../db/schema/index";
import { requestUrl, type ApiRequest } from "../../../plugins/http";
import { readPingPlayers } from "../ping-players";
import { adminCommand, adminRead } from "../../auth/admin-route";
import { writeAudit } from "../../admin/audit";

export const GET = (request: ApiRequest) => adminRead(async () => {
  const params = requestUrl(request).searchParams;
  const requested = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 1_000_000) : 1;
  return readPingPlayers(pool, (params.get("q") ?? "").trim().slice(0, 200), page);
});
export const POST = (request: ApiRequest) => adminCommand(request, async (admin, body) => {
  const id = entityId(body.playerId);
  if (!id || typeof body.disabled !== "boolean") return { ok: false, error: "请求格式有误。", status: 400 };
  const disabled = body.disabled;
  return db.transaction(async tx => {
    const [before] = await tx.select().from(player).where(and(eq(player.id,id),isNull(player.deletedAt))).for("update");
    if (!before) return { ok: false as const, error: "玩家不存在。", status: 404 };
    await tx.update(player).set({ pingDisabled: disabled }).where(eq(player.id,id));
    if (disabled) await tx.execute(sql`DELETE FROM golden_room_event WHERE player_id=${id} AND status='pending'`);
    await writeAudit(tx, admin, disabled ? "禁用 Ping 点" : "恢复 Ping 点", `玩家：${before.name}（${id}）\nPing 点：${before.pingDisabled ? "禁用" : "启用"} → ${disabled ? "禁用" : "启用"}`);
    return { ok: true as const, data: { playerId: id, disabled } };
  });
});
