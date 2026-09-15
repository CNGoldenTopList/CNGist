import { requiredEntityId } from "../../../../shared/src/entity-id";
import { CctError, cctInteger, cctText, cctUuid } from "./cct-state";
import { createHash } from "node:crypto";
import type { CctPrincipal, CctTransaction } from "./cct-repository";

export const PRESENCE_TTL_SECONDS = 60;
export type PlayerPresenceSummary = {
  status: "online" | "offline" | "not_installed";
  mapName: string | null;
  mapId: number | null;
};
export type LiveObservation = {
  datasetId?: string | null;
  sid: string | null; side: "Normal" | "BSide" | "CSide" | null; room: string | null;
  paused: boolean | null; transitioning: boolean | null; holdingGolden: boolean | null;
  cctAvailable: boolean; cctTrackingPaused: boolean | null;
};
export function parseLiveObservation(raw: unknown): LiveObservation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CctError("invalid_presence");
  const v = raw as Record<string, unknown>;
  const keys = ["sid", "side", "room", "paused", "transitioning", "holdingGolden", "cctAvailable", "cctTrackingPaused"];
  if (keys.some(k => !(k in v)) || Object.keys(v).some(k => !keys.includes(k) && k !== "datasetId")) throw new CctError("invalid_presence");
  if (v.datasetId !== undefined && v.datasetId !== null) cctUuid(v.datasetId);
  if (v.side !== null && !["Normal", "BSide", "CSide"].includes(v.side as string)) throw new CctError("invalid_presence");
  for (const k of ["paused", "transitioning", "holdingGolden", "cctTrackingPaused"])
    if (v[k] !== null && typeof v[k] !== "boolean") throw new CctError("invalid_presence");
  if (typeof v.cctAvailable !== "boolean" || (v.sid === null) !== (v.side === null)) throw new CctError("invalid_presence");
  const result = { ...v, sid: v.sid === null ? null : cctText(v.sid, 512), room: v.room === null ? null : cctText(v.room) } as LiveObservation;
  if (result.sid === null && [result.room, result.paused, result.transitioning, result.holdingGolden].some(x => x !== null)) throw new CctError("invalid_presence");
  return result;
}

/** One latest snapshot per device. A server-issued connection ID fences delayed requests. */
export function createPresenceRepository(transaction: CctTransaction, onSnapshot?: (sql: import("./cct-repository").CctSql, principal: CctPrincipal, observation: LiveObservation | null) => Promise<void>) {
  return {
    async write(p: CctPrincipal, body: Record<string, unknown>) {
      const action = body.action;
      if (!["start", "snapshot", "stop"].includes(action as string)) throw new CctError("invalid_presence");
      const connectionId = action === "start" ? null : cctUuid(body.connectionId);
      const sequence = action === "start" ? 0 : cctInteger(body.sequence);
      const observation = action === "snapshot" ? parseLiveObservation(body.observation) : null;
      if (body.transitions !== undefined && (action !== "snapshot" || !Array.isArray(body.transitions) || body.transitions.length > 256)) throw new CctError("invalid_presence");
      const transitions = ((body.transitions ?? []) as unknown[]).map(parseLiveObservation);
      const batchHash = body.transitions === undefined ? null : createHash("sha256")
        .update(JSON.stringify({ observation, transitions })).digest("hex");
      return transaction(async sql => {
        // Same lock order as statistics and privacy changes. Recheck revocation inside the transaction.
        const storage = await sql.query("SELECT enabled, history_epoch FROM tracker_cct_storage WHERE account_id=$1 FOR UPDATE", [p.accountId]);
        if (!storage.rows[0]?.enabled || storage.rows[0].history_epoch !== p.historyEpoch) throw new CctError("history_epoch_invalid");
        const device = await sql.query("SELECT id FROM tracker_device WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE", [p.deviceId, p.accountId]);
        if (!device.rows.length) throw new CctError("history_disabled");
        if (action === "start") {
          const result = await sql.query(`INSERT INTO tracker_presence(device_id,account_id,history_epoch)
            VALUES($1,$2,$3) ON CONFLICT(device_id) DO UPDATE SET connection_id=gen_random_uuid(),
            history_epoch=EXCLUDED.history_epoch, sequence=0, observation=NULL, batch_hash=NULL, connected=true, updated_at=now()
            RETURNING connection_id AS "connectionId"`, [p.deviceId, p.accountId, p.historyEpoch]);
          return { connectionId: result.rows[0].connectionId, ttlSeconds: PRESENCE_TTL_SECONDS };
        }
        const previous = await sql.query("SELECT observation, connection_id, sequence, connected, history_epoch, batch_hash FROM tracker_presence WHERE device_id=$1 AND account_id=$2", [p.deviceId, p.accountId]);
        const prior = previous.rows[0];
        // Exact batch retries acknowledge the earlier commit without replaying alerts or extending TTL.
        if (batchHash && prior?.connected && prior.connection_id === connectionId && Number(prior.sequence) === sequence
            && prior.history_epoch === p.historyEpoch && prior.batch_hash === batchHash) return { sequence, ttlSeconds: PRESENCE_TTL_SECONDS };
        let last = prior?.observation as LiveObservation | null | undefined;
        const result = await sql.query(`UPDATE tracker_presence SET sequence=$4, observation=$5::jsonb,
          connected=$6, updated_at=now(), batch_hash=$8 WHERE device_id=$1 AND account_id=$2 AND connection_id=$3
          AND sequence < $4 AND connected=true AND history_epoch=$7 RETURNING connection_id`,
          [p.deviceId, p.accountId, connectionId, sequence, JSON.stringify(observation), action !== "stop", p.historyEpoch, batchHash]);
        if (!result.rows.length) throw new CctError("presence_conflict");
        for (const entry of [...transitions, observation]) {
          if (entry?.sid && (last?.sid !== entry.sid || last?.side !== entry.side)) {
            await sql.query(`INSERT INTO tracker_map_visit(account_id,device_id,sid,side,history_epoch)
              VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id,device_id,sid,side)
              DO UPDATE SET entered_at=now(), history_epoch=EXCLUDED.history_epoch`,
              [p.accountId, p.deviceId, entry.sid, entry.side, p.historyEpoch]);
          }
          await onSnapshot?.(sql, p, entry);
          last = entry;
        }
        return { sequence, ttlSeconds: PRESENCE_TTL_SECONDS };
      });
    },
    /** Public profile summary only; never return device identity or room observations. */
    async readPlayer(playerId: number): Promise<PlayerPresenceSummary | null> {
      return transaction(async sql => {
        const result = await sql.query(`SELECT d.id IS NOT NULL AS installed,
          COALESCE(p.connected AND p.updated_at > now() - interval '60 seconds', false) AS online,
          CASE WHEN p.connected AND p.updated_at > now() - interval '60 seconds'
            THEN COALESCE(CASE WHEN c.id IS NOT NULL THEN m.name END, p.observation->>'sid') ELSE NULL END AS "mapName",
          CASE WHEN p.connected AND p.updated_at > now() - interval '60 seconds' AND c.id IS NOT NULL
            THEN m.id ELSE NULL END AS "mapId"
          FROM player pl
          LEFT JOIN account a ON a.claimed_player_id=pl.id AND a.status='active'
          LEFT JOIN tracker_device d ON d.account_id=a.id AND d.revoked_at IS NULL
          LEFT JOIN tracker_cct_storage s ON s.account_id=a.id AND s.enabled=true
          LEFT JOIN tracker_presence p ON p.device_id=d.id AND p.account_id=a.id AND p.history_epoch=s.history_epoch
          LEFT JOIN tracker_map_binding b ON b.sid=p.observation->>'sid' AND b.side=p.observation->>'side' AND b.status='approved'
          LEFT JOIN map m ON m.id=b.map_id AND m.deleted_at IS NULL
          LEFT JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
          WHERE pl.id=$1 AND pl.deleted_at IS NULL
          ORDER BY online DESC, p.updated_at DESC NULLS LAST LIMIT 1`, [playerId]);
        const row = result.rows[0];
        if (!row) return null;
        return { status: row.online ? "online" : row.installed ? "offline" : "not_installed", mapName: typeof row.mapName === "string" ? row.mapName : null, mapId: typeof row.mapId === "number" ? row.mapId : null };
      });
    },
    async read(accountId: number) {
      return transaction(async sql => {
        const result = await sql.query(`SELECT p.device_id AS "deviceId", d.name AS "deviceName",
          p.updated_at AS "updatedAt",
          (p.connected AND p.updated_at > now() - interval '60 seconds') AS online,
          CASE WHEN p.connected AND p.updated_at > now() - interval '60 seconds' THEN p.observation ELSE NULL END AS observation
          FROM tracker_presence p JOIN tracker_device d ON d.id=p.device_id AND d.account_id=p.account_id
          JOIN tracker_cct_storage s ON s.account_id=p.account_id AND s.enabled=true AND s.history_epoch=p.history_epoch
          WHERE p.account_id=$1 AND d.revoked_at IS NULL ORDER BY p.updated_at DESC`, [requiredEntityId(accountId)]);
        return result.rows;
      });
    },
  };
}
