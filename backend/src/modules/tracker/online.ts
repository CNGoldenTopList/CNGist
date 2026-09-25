import { playerBilibiliUids, firstBilibiliLiveRoom } from "../../../../shared/src/bilibili-uid";
import type { DifficultyCode } from "../../../../shared/src/types";
import type { CctTransaction } from "./cct-repository";
import { parseCctState, roomWindow } from "./cct-state";
import { projectCct } from "./cct-projection";
import { roomOverlay } from "./cct-overlay";

export type OnlineActivity = "golden" | "practice" | "clearing" | "unknown";

export type OnlinePlayer = {
  activity: OnlineActivity;
  liveUrl: string | null;
  playerId: number; playerName: string; mapId: number | null; mapName: string | null;
  mapCnName: string | null; campaignId: number | null; campaignName: string | null;
  campaignCnName: string | null; holdingGolden: boolean | null;
  challengeId: number | null; challengeName: string | null; tier: DifficultyCode | null;
  /** selection：玩家在 Mod 中明确选择；wishlist：按愿望单推测；clear：按默认 C 类挑战推测。 */
  source: "selection" | "wishlist" | "clear" | null; wishlistProgress: number | null;
  room: string | null; position: number | null; routeLength: number | null;
};

/** One current device per player; only the public live summary leaves this boundary. */
export async function readOnlinePlayers(transaction: CctTransaction, liveRooms: (uids: string[]) => Map<string, string> = () => new Map()): Promise<OnlinePlayer[]> {
  const players = await transaction(async sql => {
    const result = await sql.query(`WITH live AS (
      SELECT DISTINCT ON (pl.id) pl.id AS player_id, pl.name AS player_name, pl.bilibili_uid, pl.bilibili_url, pl.bilibili_uids, p.*
      FROM tracker_presence p
      JOIN tracker_device d ON d.id=p.device_id AND d.account_id=p.account_id AND d.revoked_at IS NULL
      JOIN tracker_cct_storage s ON s.account_id=p.account_id AND s.enabled AND s.history_epoch=p.history_epoch
      JOIN account a ON a.id=p.account_id AND a.status='active'
      JOIN player pl ON pl.id=a.claimed_player_id AND pl.deleted_at IS NULL
      WHERE p.connected AND p.updated_at > now() - interval '60 seconds'
      ORDER BY pl.id, p.updated_at DESC, p.device_id
    ) SELECT l.player_id AS "playerId", l.player_name AS "playerName", l.bilibili_uid AS "bilibiliUid", l.bilibili_url AS "bilibiliUrl", l.bilibili_uids AS "bilibiliUids",
      m.id AS "mapId", COALESCE(m.name,l.observation->>'sid') AS "mapName", m.cn_name AS "mapCnName",
      m.campaign_id AS "campaignId", m.campaign_name AS "campaignName", m.campaign_cn_name AS "campaignCnName",
      (l.observation->>'holdingGolden')::boolean AS "holdingGolden", l.observation->>'room' AS room,
      ch.id AS "challengeId", ch.name AS "challengeName", ch.tier_code AS tier,
      ch.source, ch.progress AS "wishlistProgress", sc.metadata, area.completed,
      COALESCE((SELECT jsonb_agg(r.data) FROM tracker_cct_room r WHERE r.scope_id=sc.id),'[]'::jsonb) AS rooms
    FROM live l
    LEFT JOIN tracker_map_binding b ON b.sid=l.observation->>'sid' AND b.side=l.observation->>'side' AND b.status='approved'
    LEFT JOIN (
      SELECT m.*, c.name AS campaign_name, c.cn_name AS campaign_cn_name FROM map m
      JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL WHERE m.deleted_at IS NULL
    ) m ON m.id=b.map_id
    LEFT JOIN tracker_challenge_selection sel ON sel.account_id=l.account_id AND sel.map_id=m.id
    LEFT JOIN LATERAL (
      SELECT c.*, w.progress, CASE WHEN c.id=sel.challenge_id THEN 'selection' WHEN w.id IS NOT NULL THEN 'wishlist' ELSE 'clear' END AS source, t.rank
      FROM challenge c LEFT JOIN wishlist_entry w ON w.challenge_id=c.id AND w.account_id=l.account_id AND w.status!='archive'
      LEFT JOIN tier t ON t.code=c.tier_code
      WHERE c.map_id=m.id AND c.scope='map' AND c.deleted_at IS NULL
        AND (c.id=sel.challenge_id OR w.id IS NOT NULL OR c.name IN ('C','[C]','Clear','C/FC','[C/FC]'))
      -- 明确选择优先，其次愿望单推测，最后默认 C 类挑战。
      ORDER BY (c.id=sel.challenge_id) IS TRUE DESC, (w.id IS NOT NULL) DESC,
        CASE w.status WHEN 'active' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END,
        w.updated_at DESC NULLS LAST, c.sort_order NULLS LAST, c.id LIMIT 1
    ) ch ON true
    LEFT JOIN LATERAL (
      SELECT sc.* FROM tracker_cct_scope sc
      WHERE sc.account_id=l.account_id AND sc.device_id=l.device_id
        AND sc.sid=l.observation->>'sid' AND sc.side=l.observation->>'side'
        AND (l.observation->>'datasetId' IS NULL OR sc.dataset_id=(l.observation->>'datasetId')::uuid)
        AND (l.observation->>'cctAvailable')::boolean
      ORDER BY sc.updated_at DESC, sc.id LIMIT 1
    ) sc ON true
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) OVER ()=1 THEN a.completed ELSE NULL END AS completed FROM tracker_area_stats a
      WHERE a.account_id=l.account_id AND a.device_id=l.device_id
        AND a.sid=l.observation->>'sid' AND a.side=l.observation->>'side'
        AND (COALESCE((l.observation->>'datasetId')::uuid, sc.dataset_id) IS NULL
          OR a.dataset_id=COALESCE((l.observation->>'datasetId')::uuid, sc.dataset_id))
      LIMIT 1
    ) area ON true
    ORDER BY (l.observation->>'holdingGolden')::boolean DESC NULLS LAST, ch.rank ASC NULLS LAST, l.player_name, l.player_id`);
    return result.rows.map(row => {
      let overlay = null;
      let activity: OnlineActivity = row.holdingGolden === true ? "golden" : row.completed === true ? "practice" : "unknown";
      if (row.metadata && typeof row.room === "string") {
        try {
          const state = parseCctState({ metadata: row.metadata, rooms: row.rooms });
          overlay = roomOverlay(projectCct(state), row.room);
          const room = state.rooms.find(room => room.roomKey === row.room);
          // An available empty window has no successes; missing/invalid room data stays unknown.
          if (activity === "unknown" && room) activity = roomWindow(room, 20).successes > 0 ? "practice" : "clearing";
        }
        catch { /* Invalid or unavailable route is unknown progress, never zero. */ }
      }
      return {
        bilibiliUids: playerBilibiliUids(row),
        activity,
        playerId: row.playerId, playerName: row.playerName, mapId: row.mapId, mapName: row.mapName,
        mapCnName: row.mapCnName, campaignId: row.campaignId, campaignName: row.campaignName,
        campaignCnName: row.campaignCnName, holdingGolden: row.holdingGolden,
        challengeId: (activity === "clearing" || activity === "unknown") ? null : row.challengeId, challengeName: (activity === "clearing" || activity === "unknown") ? null : row.challengeName, tier: (activity === "clearing" || activity === "unknown") ? null : row.tier,
        source: (activity === "clearing" || activity === "unknown") ? null : row.source, wishlistProgress: (activity === "clearing" || activity === "unknown") ? null : row.wishlistProgress,
        room: overlay?.displayName ?? row.room, position: overlay?.position ?? null, routeLength: overlay?.routeLength ?? null,
      } as Omit<OnlinePlayer, "liveUrl"> & { bilibiliUids: string[] };
    });
  });
  // Stable partition preserves the existing golden/tier/name ordering within each group.
  players.sort((a, b) => Number(a.activity === "clearing") - Number(b.activity === "clearing"));
  const rooms = liveRooms(players.flatMap(player => player.bilibiliUids));
  return players.map(({ bilibiliUids, ...player }) => ({ ...player, liveUrl: firstBilibiliLiveRoom(bilibiliUids, rooms) }));
}
