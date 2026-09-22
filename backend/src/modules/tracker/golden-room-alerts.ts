import { parseCctState } from "./cct-state";
import { projectCct } from "./cct-projection";
import { roomOverlay } from "./cct-overlay";
import type { CctSql, CctPrincipal } from "./cct-repository";
import type { LiveObservation } from "./presence";

export type MapRoom = { sid: string; side: string; roomKey: string; roomName: string; position: number };

/** 只派生路线名称/房间，不返回上传者、设备或尝试统计。每个 SID/面选最近有效路线。 */
export async function readMapRooms(sql: CctSql, mapId: number): Promise<MapRoom[]> {
  const result = await sql.query(`WITH routes AS (
    SELECT DISTINCT ON (sc.sid, sc.side) sc.sid, sc.side, sc.metadata
    FROM tracker_cct_scope sc
    JOIN tracker_device d ON d.id=sc.device_id AND d.account_id=sc.account_id AND d.revoked_at IS NULL
    JOIN tracker_cct_storage st ON st.account_id=sc.account_id AND st.enabled
    JOIN account a ON a.id=sc.account_id AND a.status='active'
    JOIN tracker_map_binding b ON b.sid=sc.sid AND b.side=sc.side AND b.status='approved' AND b.map_id=$1
    JOIN map m ON m.id=b.map_id AND m.deleted_at IS NULL
    JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
    WHERE jsonb_typeof(sc.metadata->'route'->'nodes')='array'
      AND jsonb_array_length(sc.metadata->'route'->'nodes')>0
    ORDER BY sc.sid, sc.side, sc.updated_at DESC, sc.id
  ) SELECT r.sid, r.side, n.node, n.position FROM routes r,
    jsonb_array_elements(r.metadata->'route'->'nodes') WITH ORDINALITY AS n(node,position)
    ORDER BY r.sid,r.side,n.position`, [mapId]);
  const rooms = new Map<string, MapRoom>();
  for (const row of result.rows) {
    const node = row.node as { roomKey: string; customRoomName?: string; groupedRooms?: string[] };
    for (const key of [node.roomKey, ...(node.groupedRooms ?? [])]) {
      if (typeof key !== "string" || !key) continue;
      const id = JSON.stringify([row.sid, row.side, key]);
      if (!rooms.has(id)) rooms.set(id, { sid: String(row.sid), side: String(row.side), roomKey: key,
        roomName: key === node.roomKey ? node.customRoomName || key : key, position: Number(row.position) });
    }
  }
  return [...rooms.values()];
}

/** 在已通过设备鉴权和 sequence CAS 的同一心跳事务内运行。 */
export async function captureGoldenRoomEntry(sql: CctSql, p: CctPrincipal, observation: LiveObservation | null) {
  // stop/start 不代表物理离开房间，保留停留状态，避免断线重连重复推送。
  if (!observation || observation.transitioning) return;
  const { rows } = await sql.query(`SELECT r.*, s.inside, s.history_epoch AS old_epoch,
    a.claimed_player_id AS player_id,
    EXISTS(SELECT 1 FROM tracker_map_binding b JOIN map m ON m.id=b.map_id AND m.deleted_at IS NULL
      JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
      WHERE b.sid=r.sid AND b.side=r.side AND b.map_id=r.map_id AND b.status='approved') AS valid
    FROM golden_room_rule r
    JOIN account a ON a.id=$1 AND a.status='active'
    JOIN player pl ON pl.id=a.claimed_player_id AND pl.deleted_at IS NULL AND NOT pl.ping_disabled
    JOIN wishlist_entry w ON w.id=r.wishlist_entry_id AND w.account_id=a.id
    JOIN challenge ch ON ch.id=w.challenge_id AND ch.map_id=r.map_id AND ch.deleted_at IS NULL
    JOIN tier t ON t.code=ch.tier_code AND t.is_official
    LEFT JOIN golden_room_state s ON s.rule_id=r.id AND s.account_id=a.id
    WHERE r.enabled FOR KEY SHARE OF r`, [p.accountId]);
  for (const rule of rows) {
    const inside = Boolean(rule.valid) && observation.holdingGolden === true
      && observation.sid === rule.sid && observation.side === rule.side && observation.room === rule.room_key;
    const wasInside = rule.inside === true && rule.old_epoch === p.historyEpoch;
    if (!inside && rule.inside == null) continue;
    await sql.query(`INSERT INTO golden_room_state(rule_id,account_id,inside,history_epoch) VALUES($1,$2,$3,$4)
      ON CONFLICT(rule_id,account_id) DO UPDATE SET inside=EXCLUDED.inside,history_epoch=EXCLUDED.history_epoch`,
      [rule.id, p.accountId, inside, p.historyEpoch]);
    if (inside && !wasInside) await sql.query(`INSERT INTO golden_room_event(rule_id,account_id,device_id,player_id,history_epoch)
      VALUES($1,$2,$3,$4,$5)`, [rule.id, p.accountId, p.deviceId, rule.player_id, p.historyEpoch]);
  }
}

export type GoldenRoomNotification = {
  id: number; playerName: string; bilibiliUid: string | null; bilibiliUrl: string | null; bilibiliUids: string[];
  position: number | null; routeLength: number | null;
  challengeName?: string; mapName: string; campaignName: string; roomName: string; roomKey: string; extraText: string;
};

/** 必须在事务中领取；发送前再次检查撤权、软删除、配对与通知时效。 */
export async function claimGoldenRoomEvent(sql: CctSql): Promise<GoldenRoomNotification | null> {
  await sql.query("DELETE FROM golden_room_event WHERE created_at < now() - interval '5 minutes'");
  const result = await sql.query(`SELECT e.id, pl.name AS "playerName", pl.bilibili_uid AS "bilibiliUid", pl.bilibili_url AS "bilibiliUrl", pl.bilibili_uids AS "bilibiliUids",
    COALESCE(NULLIF(m.cn_name,''),m.name) AS "mapName", COALESCE(NULLIF(c.cn_name,''),c.name) AS "campaignName",
    ch.name AS "challengeName",r.room_name AS "roomName",r.room_key AS "roomKey",r.extra_text AS "extraText", sc.metadata
    FROM golden_room_event e JOIN golden_room_rule r ON r.id=e.rule_id AND r.enabled
    JOIN account a ON a.id=e.account_id AND a.status='active' AND a.claimed_player_id=e.player_id
    JOIN player pl ON pl.id=e.player_id AND pl.deleted_at IS NULL AND NOT pl.ping_disabled
    JOIN wishlist_entry w ON w.id=r.wishlist_entry_id AND w.account_id=a.id
    JOIN challenge ch ON ch.id=w.challenge_id AND ch.map_id=r.map_id AND ch.deleted_at IS NULL
    JOIN tier t ON t.code=ch.tier_code AND t.is_official
    JOIN tracker_device d ON d.id=e.device_id AND d.account_id=e.account_id AND d.revoked_at IS NULL
    JOIN tracker_cct_storage st ON st.account_id=e.account_id AND st.enabled AND st.history_epoch=e.history_epoch
    JOIN map m ON m.id=r.map_id AND m.deleted_at IS NULL
    JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
    JOIN tracker_map_binding b ON b.sid=r.sid AND b.side=r.side AND b.map_id=r.map_id AND b.status='approved'
    LEFT JOIN LATERAL (
      SELECT sc.metadata FROM tracker_cct_scope sc
      WHERE sc.account_id=e.account_id AND sc.device_id=e.device_id AND sc.sid=r.sid AND sc.side=r.side
      ORDER BY sc.updated_at DESC,sc.id DESC LIMIT 1
    ) sc ON true
    WHERE e.status='pending' AND e.created_at > now() - interval '60 seconds'
    ORDER BY e.created_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  await sql.query("UPDATE golden_room_event SET status='sending' WHERE id=$1",[row.id]);
  const { metadata, ...notification } = row;
  let position: number | null = null, routeLength: number | null = null;
  if (metadata) {
    try {
      // 只使用触发玩家、设备的路线；无需读取尝试数据，位置沿用 CCT 的分组和忽略规则。
      const overlay = roomOverlay(projectCct(parseCctState({ metadata, rooms: [] })), String(row.roomKey));
      position = overlay?.position ?? null;
      routeLength = position === null ? null : overlay?.routeLength ?? null;
    } catch { /* 未配置或无效路线只显示房间 key。 */ }
  }
  return { ...notification, position, routeLength } as GoldenRoomNotification;
}
