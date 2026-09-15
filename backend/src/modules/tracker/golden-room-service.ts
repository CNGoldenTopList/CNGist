import { pool } from "../../db/client";
import { readMapRooms } from "./golden-room-alerts";

export async function readGoldenRoomSettings(mapId?: number) {
  const maps = await pool.query(`SELECT DISTINCT m.id, m.name, m.cn_name AS "cnName",
    c.name AS "campaignName", c.cn_name AS "campaignCnName"
    FROM map m JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
    JOIN tracker_map_binding b ON b.map_id=m.id AND b.status='approved'
    WHERE m.deleted_at IS NULL ORDER BY c.name,m.name`);
  const rules = await pool.query(`SELECT r.id, r.map_id AS "mapId", r.sid,r.side,r.room_key AS "roomKey",
    r.room_name AS "roomName",r.extra_text AS "extraText",r.enabled,
    COALESCE(NULLIF(m.cn_name,''),m.name) AS "mapName", COALESCE(NULLIF(c.cn_name,''),c.name) AS "campaignName"
    FROM golden_room_rule r JOIN map m ON m.id=r.map_id JOIN campaign c ON c.id=m.campaign_id
    ORDER BY c.name,m.name,r.sid,r.side,r.room_key`);
  return { maps: maps.rows, rules: rules.rows, rooms: mapId ? await readMapRooms(pool, mapId) : [] };
}
