import { entityId } from "../../../../shared/src/entity-id";
import { isTierCode } from "../../../../shared/src/tiers";
import type { CctSql } from "./cct-repository";
import { readMapRooms } from "./golden-room-alerts";

export class PingError extends Error {
  constructor(public reason: "disabled" | "ineligible" | "claim" | "invalid", public status = 400) { super(reason); }
}

/** 身份从会话取得；锁定愿望单，串行化保存与删除。 */
async function target(sql: CctSql, accountId: number, wishId: number, lock = false) {
  const { rows } = await sql.query(`SELECT w.id, ch.map_id, ch.tier_code, pl.ping_disabled,
      pl.id AS player_id, ch.deleted_at IS NULL AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND m.id IS NOT NULL AS valid
    FROM wishlist_entry w JOIN account a ON a.id=w.account_id AND a.status='active'
    JOIN challenge ch ON ch.id=w.challenge_id
    LEFT JOIN player pl ON pl.id=a.claimed_player_id AND pl.deleted_at IS NULL
    LEFT JOIN map m ON m.id=ch.map_id LEFT JOIN campaign c ON c.id=m.campaign_id
    WHERE w.id=$1 AND w.account_id=$2 ${lock ? 'FOR UPDATE OF w' : ''}`, [wishId, accountId]);
  if (!rows[0]) throw new PingError("invalid", 404);
  return rows[0];
}

export async function readWishlistPing(sql: CctSql, accountId: number, wishId: number) {
  const row = await target(sql, accountId, wishId);
  const eligible = row.valid === true && isTierCode(row.tier_code as string);
  const rules = await sql.query(`SELECT sid,side,room_key AS "roomKey",room_name AS "roomName" FROM golden_room_rule WHERE wishlist_entry_id=$1`, [wishId]);
  return { eligible, disabled: row.ping_disabled === true, claimed: !!row.player_id, point: rules.rows[0] ?? null,
    rooms: eligible ? await readMapRooms(sql, Number(row.map_id)) : [] };
}

/** 在调用方事务中执行，拒绝客户端伪造房间、挑战难度或玩家身份。 */
export async function saveWishlistPing(sql: CctSql, accountId: number, raw: Record<string, unknown>) {
  const wishId = entityId(raw.wishId);
  if (!wishId) throw new PingError("invalid");
  const row = await target(sql, accountId, wishId, true);
  if (raw.point === null) {
    await sql.query("DELETE FROM golden_room_rule WHERE wishlist_entry_id=$1", [wishId]);
    return;
  }
  if (!row.player_id) throw new PingError("claim", 403);
  // 与管理员禁用共享玩家锁，避免禁用和保存交错。
  const player = await sql.query("SELECT ping_disabled FROM player WHERE id=$1 FOR UPDATE", [row.player_id]);
  if (player.rows[0]?.ping_disabled) throw new PingError("disabled", 403);
  if (!row.valid || !isTierCode(row.tier_code as string)) throw new PingError("ineligible");
  const point = raw.point as Record<string, unknown> | null;
  const rooms = await readMapRooms(sql, Number(row.map_id));
  const room = rooms.find(r => r.sid === point?.sid && r.side === point?.side && r.roomKey === point?.roomKey);
  if (!room) throw new PingError("invalid");
  const existing = await sql.query("SELECT id,sid,side,room_key FROM golden_room_rule WHERE wishlist_entry_id=$1", [wishId]);
  if (existing.rows[0]?.sid === room.sid && existing.rows[0]?.side === room.side && existing.rows[0]?.room_key === room.roomKey) return;
  // 更换点位清除旧停留及队列，旧事件不得套用新房间名称。
  await sql.query("DELETE FROM golden_room_rule WHERE wishlist_entry_id=$1", [wishId]);
  await sql.query(`INSERT INTO golden_room_rule(wishlist_entry_id,map_id,sid,side,room_key,room_name)
    VALUES($1,$2,$3,$4,$5,$6)`, [wishId,row.map_id,room.sid,room.side,room.roomKey,room.roomName]);
}
