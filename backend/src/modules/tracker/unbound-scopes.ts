import type { CctSql } from "./cct-repository";

export const UNBOUND_SCOPE_LIMIT = 10;
type Side = "Normal" | "BSide" | "CSide";

/** Latest entry per SID/side across devices. Legacy uploads have no known entry time. */
export async function readUnboundScopes(sql: CctSql, accountId: number, target?: { sid: string; side: Side }) {
  const result = await sql.query(`WITH uploaded AS (
      SELECT sid, side FROM tracker_cct_scope WHERE account_id=$1
      UNION SELECT sid, side FROM tracker_area_stats WHERE account_id=$1
      UNION SELECT v.sid, v.side FROM tracker_map_visit v
        JOIN tracker_device d ON d.id=v.device_id AND d.account_id=v.account_id AND d.revoked_at IS NULL
        JOIN tracker_cct_storage s ON s.account_id=v.account_id AND s.enabled=true AND s.history_epoch=v.history_epoch
        WHERE v.account_id=$1
    ), visits AS (
      SELECT v.sid, v.side, max(v.entered_at) AS entered_at FROM tracker_map_visit v
        JOIN tracker_device d ON d.id=v.device_id AND d.account_id=v.account_id AND d.revoked_at IS NULL
        JOIN tracker_cct_storage s ON s.account_id=v.account_id AND s.enabled=true AND s.history_epoch=v.history_epoch
        WHERE v.account_id=$1 GROUP BY v.sid, v.side
    )
    SELECT u.sid, u.side, p.map_id AS "pendingMapId"
    FROM uploaded u LEFT JOIN visits v ON v.sid=u.sid AND v.side=u.side
    LEFT JOIN tracker_map_binding p ON p.sid=u.sid AND p.side=u.side AND p.account_id=$1 AND p.status='pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM tracker_map_binding b JOIN map m ON m.id=b.map_id AND m.deleted_at IS NULL
      WHERE b.sid=u.sid AND b.side=u.side AND b.status='approved'
    ) AND ($2::text IS NULL OR (u.sid=$2 AND u.side=$3))
    ORDER BY v.entered_at DESC NULLS LAST, u.sid COLLATE "C", u.side COLLATE "C"
    LIMIT ${UNBOUND_SCOPE_LIMIT}`, [accountId, target?.sid ?? null, target?.side ?? null]);
  return result.rows.map(row => ({ sid: String(row.sid), side: row.side as Side,
    pendingMapId: typeof row.pendingMapId === "number" ? row.pendingMapId : null }));
}
