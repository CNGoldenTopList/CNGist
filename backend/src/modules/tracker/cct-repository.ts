import { requiredEntityId } from "../../../../shared/src/entity-id";
import { CCT_LIMITS, CctError, applyCctPatch, cctInteger, cctUuid, hashCct, parseCctPatch, parseCctScope, parseCctState } from "./cct-state";
import type { CctMetadata, CctScope, CctState } from "./cct-state";

export interface CctSql { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export type CctTransaction = <T>(work: (sql: CctSql) => Promise<T>) => Promise<T>;
/** Must come from server-side authentication, never deserialized as part of a telemetry request. */
export type CctPrincipal = { accountId: number; deviceId: number; historyEpoch: string };
export type CctCursor = { streamEpoch: string; revision: number; stateHash: string };
type StoredScope = CctCursor & { id: number; lastMutationId: string; lastMutationHash: string; metadata: CctMetadata };
const columns = 'id, stream_epoch AS "streamEpoch", revision, state_hash AS "stateHash", last_mutation_id AS "lastMutationId", last_mutation_hash AS "lastMutationHash", metadata';
const scopeWhere = "account_id=$1 AND device_id=$2 AND dataset_id=$3 AND sid=$4 AND side=$5 AND segment_key=$6";
const values = (p: CctPrincipal, s: CctScope) => [p.accountId, p.deviceId, s.datasetId, s.sid, s.side, s.segmentKey];
function principal(raw: CctPrincipal): CctPrincipal {
  return { accountId: requiredEntityId(raw.accountId), deviceId: requiredEntityId(raw.deviceId), historyEpoch: cctUuid(raw.historyEpoch) };
}
function decode(row: Record<string, unknown>): StoredScope {
  return { ...row, revision: Number(row.revision) } as StoredScope;
}
function cursor(row: CctCursor): CctCursor { return { streamEpoch: row.streamEpoch, revision: row.revision, stateHash: row.stateHash }; }
function sameCursor(a: CctCursor, b: CctCursor) {
  return a.streamEpoch === b.streamEpoch && a.revision === b.revision && a.stateHash === b.stateHash;
}
async function authorize(sql: CctSql, p: CctPrincipal) {
  // The account lock serializes privacy changes, writes and scope quota checks for one player only.
  const { rows } = await sql.query("SELECT enabled, history_epoch FROM tracker_cct_storage WHERE account_id=$1 FOR UPDATE", [p.accountId]);
  if (!rows[0]?.enabled) throw new CctError("history_disabled");
  if (rows[0].history_epoch !== p.historyEpoch) throw new CctError("history_epoch_invalid");
}
async function find(sql: CctSql, p: CctPrincipal, scope: CctScope) {
  const { rows } = await sql.query(`SELECT ${columns} FROM tracker_cct_scope WHERE ${scopeWhere} FOR UPDATE`, values(p, scope));
  return rows[0] ? decode(rows[0]) : null;
}
async function readState(sql: CctSql, row: StoredScope): Promise<CctState> {
  const { rows } = await sql.query("SELECT data FROM tracker_cct_room WHERE scope_id=$1 ORDER BY room_key COLLATE \"C\"", [row.id]);
  return parseCctState({ metadata: row.metadata, rooms: rows.map(r => r.data) });
}
async function upsertRooms(sql: CctSql, id: number, rooms: CctState["rooms"]) {
  if (!rooms.length) return;
  await sql.query(`INSERT INTO tracker_cct_room (scope_id, room_key, data)
    SELECT $1, value->>'roomKey', value FROM jsonb_array_elements($2::jsonb)
    ON CONFLICT (scope_id, room_key) DO UPDATE SET data=EXCLUDED.data`, [id, JSON.stringify(rooms)]);
}

/** Latest-state storage only. Mutations are applied transactionally and are never archived. */
export function createCctRepository(transaction: CctTransaction) {
  return {
    async reportAreaStats(p: CctPrincipal, input: { datasetId: string; sid: string; side: string; noGoldenBestDeaths: number | null; totalDeaths?: number | null; completed?: boolean | null; source: string; practiceDetection: string }) {
      p = principal(p);
      const scope = parseCctScope({ datasetId: input.datasetId, sid: input.sid, side: input.side, segmentKey: "area" });
      if (input.source !== "observed_no_native_golden_clear_v1" || input.practiceDetection !== "none") throw new CctError("unsupported_area_stats_source");
      const best = input.noGoldenBestDeaths === null ? null : cctInteger(input.noGoldenBestDeaths);
      const completed = input.completed ?? null;
      if (completed !== null && typeof completed !== "boolean") throw new CctError("invalid_completed");
      const total = input.totalDeaths == null ? null : cctInteger(input.totalDeaths);
      if ((best !== null && best > 2147483647) || (total !== null && total > 2147483647)) throw new CctError("invalid_deaths");
      return transaction(async sql => {
        await authorize(sql, p);
        const key = [p.accountId, p.deviceId, scope.datasetId, scope.sid, scope.side];
        if (best !== null || total !== null || completed !== null) {
          const existing = await sql.query("SELECT id FROM tracker_area_stats WHERE account_id=$1 AND device_id=$2 AND dataset_id=$3 AND sid=$4 AND side=$5", key);
          if (!existing.rows.length) {
            const count = await sql.query("SELECT count(*) AS count FROM tracker_area_stats WHERE account_id=$1", [p.accountId]);
            if (Number(count.rows[0].count) >= 1000) throw new CctError("scope_quota_exceeded");
          }
          // PostgreSQL LEAST/GREATEST ignore NULL: unknown fields never erase known counters.
          await sql.query(`INSERT INTO tracker_area_stats(account_id,device_id,dataset_id,sid,side,no_golden_best_deaths,total_deaths,completed)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id,device_id,dataset_id,sid,side)
            DO UPDATE SET no_golden_best_deaths=LEAST(tracker_area_stats.no_golden_best_deaths,EXCLUDED.no_golden_best_deaths),
              total_deaths=GREATEST(tracker_area_stats.total_deaths,EXCLUDED.total_deaths),
              completed=CASE WHEN tracker_area_stats.completed OR EXCLUDED.completed THEN true
                ELSE COALESCE(tracker_area_stats.completed,EXCLUDED.completed) END,updated_at=now()
            WHERE tracker_area_stats.no_golden_best_deaths IS DISTINCT FROM LEAST(tracker_area_stats.no_golden_best_deaths,EXCLUDED.no_golden_best_deaths)
               OR tracker_area_stats.total_deaths IS DISTINCT FROM GREATEST(tracker_area_stats.total_deaths,EXCLUDED.total_deaths)
               OR tracker_area_stats.completed IS DISTINCT FROM (CASE WHEN tracker_area_stats.completed OR EXCLUDED.completed THEN true
                 ELSE COALESCE(tracker_area_stats.completed,EXCLUDED.completed) END)`, [...key, best, total, completed]);
        }
        const result = await sql.query("SELECT no_golden_best_deaths,total_deaths,completed FROM tracker_area_stats WHERE account_id=$1 AND device_id=$2 AND dataset_id=$3 AND sid=$4 AND side=$5", key);
        return { completed: result.rows[0]?.completed ?? null, noGoldenBestDeaths: result.rows[0]?.no_golden_best_deaths ?? null, totalDeaths: result.rows[0]?.total_deaths ?? null, source: input.source, practiceDetection: "none" };
      });
    },
    async setHistoryEnabled(accountId: number, enabled: boolean) {
      accountId = requiredEntityId(accountId);
      if (typeof enabled !== "boolean") throw new CctError("invalid_preference");
      return transaction(async sql => {
        await sql.query("INSERT INTO tracker_cct_storage(account_id) VALUES ($1) ON CONFLICT DO NOTHING", [accountId]);
        const { rows } = await sql.query("SELECT enabled, history_epoch FROM tracker_cct_storage WHERE account_id=$1 FOR UPDATE", [accountId]);
        if (rows[0].enabled === enabled) return { enabled, historyEpoch: String(rows[0].history_epoch) };
        const result = await sql.query(`UPDATE tracker_cct_storage SET enabled=$2, history_epoch=gen_random_uuid(), updated_at=now()
          WHERE account_id=$1 RETURNING history_epoch`, [accountId, enabled]);
        return { enabled, historyEpoch: String(result.rows[0].history_epoch) };
      });
    },

    async clearHistory(accountId: number) {
      accountId = requiredEntityId(accountId);
      return transaction(async sql => {
        await sql.query("INSERT INTO tracker_cct_storage(account_id) VALUES ($1) ON CONFLICT DO NOTHING", [accountId]);
        // Disable until the website explicitly requests a new import. Old queues cannot resurrect data.
        await sql.query("UPDATE tracker_cct_storage SET enabled=false, history_epoch=gen_random_uuid(), updated_at=now() WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM tracker_cct_scope WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM tracker_area_stats WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM tracker_presence WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM tracker_map_visit WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM golden_room_state WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM golden_room_event WHERE account_id=$1", [accountId]);
        await sql.query("DELETE FROM tracker_challenge_selection WHERE account_id=$1", [accountId]);
      });
    },

    async read(p: CctPrincipal, rawScope: unknown) {
      p = principal(p); const scope = parseCctScope(rawScope);
      return transaction(async sql => {
        await authorize(sql, p);
        const row = await find(sql, p, scope);
        return row ? { ...cursor(row), state: await readState(sql, row) } : null;
      });
    },

    async baseline(p: CctPrincipal, input: {
      scope: unknown; mutationId: string; streamEpoch: string; revision: number;
      expected: CctCursor | null; state: unknown;
    }) {
      p = principal(p);
      const scope = parseCctScope(input.scope), state = parseCctState(input.state);
      if (state.metadata.route?.chapterSID != null && state.metadata.route.chapterSID !== scope.sid) throw new CctError("route_sid_conflict");
      const mutationId = cctUuid(input.mutationId), streamEpoch = cctUuid(input.streamEpoch), revision = cctInteger(input.revision);
      const stateHash = hashCct(state);
      const mutationHash = hashCct({ kind: "baseline", scope, streamEpoch, revision, expected: input.expected, stateHash });
      return transaction(async sql => {
        await authorize(sql, p);
        const row = await find(sql, p, scope);
        if (row?.lastMutationId === mutationId) {
          if (row.lastMutationHash !== mutationHash) throw new CctError("mutation_conflict");
          return { ...cursor(row), duplicate: true };
        }
        if (row ? !input.expected || !sameCursor(row, input.expected) : input.expected !== null) throw new CctError("cursor_conflict");
        if (row?.streamEpoch === streamEpoch && revision <= row.revision) throw new CctError("stale_revision");
        let id = row?.id;
        if (!id) {
          const count = await sql.query("SELECT count(*) AS count FROM tracker_cct_scope WHERE account_id=$1", [p.accountId]);
          if (Number(count.rows[0].count) >= CCT_LIMITS.scopesPerAccount) throw new CctError("scope_quota_exceeded");
          const added = await sql.query(`INSERT INTO tracker_cct_scope(account_id,device_id,dataset_id,sid,side,segment_key,stream_epoch,revision,state_hash,last_mutation_id,last_mutation_hash,metadata)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING id`,
          [...values(p, scope), streamEpoch, revision, stateHash, mutationId, mutationHash, JSON.stringify(state.metadata)]);
          id = Number(added.rows[0].id);
        } else {
          await sql.query(`UPDATE tracker_cct_scope SET stream_epoch=$2,revision=$3,state_hash=$4,last_mutation_id=$5,last_mutation_hash=$6,metadata=$7::jsonb,updated_at=now() WHERE id=$1`,
            [id, streamEpoch, revision, stateHash, mutationId, mutationHash, JSON.stringify(state.metadata)]);
          await sql.query("DELETE FROM tracker_cct_room WHERE scope_id=$1", [id]);
        }
        await upsertRooms(sql, id, state.rooms);
        return { streamEpoch, revision, stateHash, duplicate: false };
      });
    },

    async change(p: CctPrincipal, input: {
      scope: unknown; mutationId: string; expected: CctCursor; revision: number; patch: unknown; afterStateHash: string;
    }) {
      p = principal(p);
      const scope = parseCctScope(input.scope), patch = parseCctPatch(input.patch);
      const mutationId = cctUuid(input.mutationId), revision = cctInteger(input.revision);
      const mutationHash = hashCct({ kind: "change", scope, expected: input.expected, revision, patch, afterStateHash: input.afterStateHash });
      return transaction(async sql => {
        await authorize(sql, p);
        const row = await find(sql, p, scope);
        if (!row) throw new CctError("baseline_required");
        if (row.lastMutationId === mutationId) {
          if (row.lastMutationHash !== mutationHash) throw new CctError("mutation_conflict");
          return { ...cursor(row), duplicate: true };
        }
        if (!sameCursor(row, input.expected)) throw new CctError("cursor_conflict");
        if (revision !== row.revision + 1) throw new CctError("revision_gap");
        const oldState = await readState(sql, row);
        const state = applyCctPatch(oldState, patch), stateHash = hashCct(state);
        if (state.metadata.route?.chapterSID != null && state.metadata.route.chapterSID !== scope.sid) throw new CctError("route_sid_conflict");
        if (stateHash !== input.afterStateHash) throw new CctError("state_hash_mismatch");
        if (patch.removeRooms.length) await sql.query("DELETE FROM tracker_cct_room WHERE scope_id=$1 AND room_key=ANY($2::text[])", [row.id, patch.removeRooms]);
        await upsertRooms(sql, row.id, patch.replaceRooms);
        await sql.query(`UPDATE tracker_cct_scope SET revision=$2,state_hash=$3,last_mutation_id=$4,last_mutation_hash=$5,metadata=$6::jsonb,updated_at=now() WHERE id=$1`,
          [row.id, revision, stateHash, mutationId, mutationHash, JSON.stringify(state.metadata)]);
        return { streamEpoch: row.streamEpoch, revision, stateHash, duplicate: false };
      });
    },
  };
}
