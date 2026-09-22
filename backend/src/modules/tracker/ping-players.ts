import type { CctSql } from "./cct-repository";

/** 已设置的玩家保留用于恢复权限；按仍有效且启用的点位数排序。 */
export async function readPingPlayers(sql: CctSql, query = "", page = 1) {
  const result = await sql.query(`WITH configured AS (
    SELECT p.id,p.name,p.ping_disabled AS disabled,count(*)::int AS "configuredPoints",
      count(*) FILTER (WHERE r.enabled AND NOT p.ping_disabled AND a.status='active'
        AND ch.deleted_at IS NULL AND t.is_official AND m.deleted_at IS NULL AND c.deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM tracker_map_binding b WHERE b.map_id=r.map_id
          AND b.sid=r.sid AND b.side=r.side AND b.status='approved'))::int AS points
    FROM player p JOIN account a ON a.claimed_player_id=p.id
    JOIN wishlist_entry w ON w.account_id=a.id JOIN golden_room_rule r ON r.wishlist_entry_id=w.id
    JOIN challenge ch ON ch.id=w.challenge_id AND ch.map_id=r.map_id
    JOIN map m ON m.id=r.map_id JOIN campaign c ON c.id=m.campaign_id
    LEFT JOIN tier t ON t.code=ch.tier_code
    WHERE p.deleted_at IS NULL AND (strpos(lower(p.name),lower($1))>0 OR p.id::text=$1)
    GROUP BY p.id
  ), paged AS (SELECT * FROM configured ORDER BY points DESC,name,id LIMIT 20 OFFSET $2)
  SELECT (SELECT count(*)::int FROM configured) AS total,
    COALESCE((SELECT jsonb_agg(paged ORDER BY points DESC,name,id) FROM paged),'[]'::jsonb) AS players`,
  [query, (page - 1) * 20]);
  return result.rows[0] as { total: number; players: Array<{id:number;name:string;disabled:boolean;points:number;configuredPoints:number}> };
}
