import { createHash } from "node:crypto";
import { CctError, cctUuid } from "./cct-state";
import type { CctPrincipal, CctSql, CctTransaction } from "./cct-repository";
import { parsePublish, routeText, routeSide, type RoutePayload } from "./shared-route";

const summary = `r.external_id AS id,r.sid,r.side,r.name,r.revision,r.room_count AS "roomCount",r.updated_at AS "updatedAt",
  a.display_name AS author,s.external_id AS "sourceId",s.name AS "sourceName",sa.display_name AS "sourceAuthor"`;
const joins = `FROM tracker_shared_route r JOIN account a ON a.id=r.account_id
  LEFT JOIN tracker_shared_route s ON s.id=r.source_id LEFT JOIN account sa ON sa.id=s.account_id`;
async function authorize(sql: CctSql, p: CctPrincipal) {
  const storage = await sql.query("SELECT enabled,history_epoch FROM tracker_cct_storage WHERE account_id=$1 FOR UPDATE", [p.accountId]);
  if (!storage.rows[0]?.enabled) throw new CctError("history_disabled");
  if (storage.rows[0].history_epoch !== p.historyEpoch) throw new CctError("history_epoch_invalid");
  const device = await sql.query("SELECT id FROM tracker_device WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL FOR SHARE", [p.deviceId, p.accountId]);
  const account = await sql.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR SHARE", [p.accountId]);
  if (!device.rows.length || !account.rows.length) throw new CctError("history_disabled");
}
export function createSharedRouteRepository(transaction: CctTransaction) {
  return {
    async publish(p: CctPrincipal, raw: Record<string, unknown>) {
      const v = parsePublish(raw), json = JSON.stringify(v.payload), bytes = Buffer.byteLength(json);
      const hash = createHash("sha256").update(JSON.stringify([v.sid,v.side,v.sourceId,v.payload])).digest("hex");
      return transaction(async sql => {
        await authorize(sql,p);
        const old = (await sql.query("SELECT * FROM tracker_shared_route WHERE external_id=$1 FOR UPDATE", [v.id])).rows[0];
        if (old) {
          if (old.account_id !== p.accountId || old.device_id !== p.deviceId || old.deleted_at || old.sid !== v.sid || old.side !== v.side)
            throw new CctError("shared_route_conflict");
          if (Number(old.revision) > v.revision || (Number(old.revision) === v.revision && old.content_hash !== hash)) throw new CctError("shared_route_conflict");
          if (Number(old.revision) === v.revision) return { id: v.id, revision: v.revision };
        }
        let sourceId: number | null = null;
        if (v.sourceId) {
          const source = (await sql.query("SELECT id FROM tracker_shared_route WHERE external_id=$1 AND sid=$2 AND side=$3", [v.sourceId,v.sid,v.side])).rows[0];
          if (v.sourceId === v.id || !source) throw new CctError("shared_route_source_missing");
          sourceId = Number(source.id);
        }
        const usage = (await sql.query("SELECT count(*) AS count,coalesce(sum(payload_bytes),0) AS bytes FROM tracker_shared_route WHERE account_id=$1", [p.accountId])).rows[0];
        if ((!old && Number(usage.count) >= 1000) || Number(usage.bytes) - Number(old?.payload_bytes ?? 0) + bytes > 32 * 1024 * 1024) throw new CctError("scope_quota_exceeded");
        const count = v.payload.route.checkpoints.reduce((n,c) => n+c.rooms.filter(r => !r.isNonGameplayRoom).length,0);
        const written = await sql.query(`INSERT INTO tracker_shared_route(external_id,account_id,device_id,sid,side,name,revision,content_hash,payload,payload_bytes,room_count,source_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
          ON CONFLICT(external_id) DO UPDATE SET name=EXCLUDED.name,revision=EXCLUDED.revision,content_hash=EXCLUDED.content_hash,payload=EXCLUDED.payload,
            payload_bytes=EXCLUDED.payload_bytes,room_count=EXCLUDED.room_count,source_id=EXCLUDED.source_id,updated_at=now()
          WHERE tracker_shared_route.account_id=EXCLUDED.account_id AND tracker_shared_route.device_id=EXCLUDED.device_id
            AND tracker_shared_route.sid=EXCLUDED.sid AND tracker_shared_route.side=EXCLUDED.side
            AND tracker_shared_route.deleted_at IS NULL AND tracker_shared_route.revision<EXCLUDED.revision
          RETURNING id`,
          [v.id,p.accountId,p.deviceId,v.sid,v.side,v.payload.route.name,v.revision,hash,json,bytes,count,sourceId]);
        // Another account can race the first insert; enforce ownership inside the upsert too.
        if (!written.rows.length) throw new CctError("shared_route_conflict");
        return { id: v.id, revision: v.revision };
      });
    },
    async remove(p: CctPrincipal, id: unknown) {
      id = cctUuid(id);
      return transaction(async sql => {
        await authorize(sql,p);
        // Keep a tombstone so a delayed upload cannot resurrect a deleted share.
        const result = await sql.query(`UPDATE tracker_shared_route SET deleted_at=coalesce(deleted_at,now()),payload=NULL,payload_bytes=0
          WHERE external_id=$1 AND account_id=$2 RETURNING external_id AS id`, [id,p.accountId]);
        if (!result.rows.length) throw new CctError("shared_route_missing");
        return { id };
      });
    },
    async list(sid: unknown, side: unknown, offset = 0, owner: number | null = null) {
      sid = routeText(sid,512); side = routeSide(side);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new CctError("invalid_shared_route");
      return transaction(async sql => {
        const result = await sql.query(`SELECT ${summary},(r.account_id=$4::integer) IS TRUE AS owned ${joins}
          WHERE r.sid=$1 AND r.side=$2 AND r.deleted_at IS NULL AND a.status='active'
          ORDER BY r.updated_at DESC,r.id LIMIT 21 OFFSET $3`, [sid,side,offset,owner]);
        return { routes: result.rows.slice(0,20), nextOffset: result.rows.length>20 ? offset+20 : null };
      });
    },
    async read(id: unknown) {
      id=cctUuid(id);
      return transaction(async sql => {
        const row = (await sql.query(`SELECT ${summary},r.payload ${joins} WHERE r.external_id=$1 AND r.deleted_at IS NULL AND a.status='active'`,[id])).rows[0];
        if (!row) throw new CctError("shared_route_missing");
        const { payload,...info } = row;
        return { ...info,...payload as RoutePayload };
      });
    },
  };
}
