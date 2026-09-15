/** 检查主键、外键、回收引用和 DAG 完整性。 */
import { pool } from "../../src/db/client";
export async function checkDatabase(client: Pick<typeof pool, "query">) {
  const invalid = await client.query(`SELECT t.table_name FROM information_schema.tables t
    LEFT JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name AND c.column_name='id'
    WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
    AND (c.is_identity IS DISTINCT FROM 'YES' OR c.data_type IS DISTINCT FROM 'integer'
      OR NOT EXISTS (SELECT 1 FROM pg_constraint pk JOIN pg_class r ON r.oid=pk.conrelid
        JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=pk.conkey[1]
        WHERE pk.contype='p' AND cardinality(pk.conkey)=1 AND r.relnamespace='public'::regnamespace AND r.relname=t.table_name AND a.attname='id'))`);
  if (invalid.rows.length) throw new Error("存在非自增数字主键的业务表");
  const broken = await client.query(`SELECT 1 FROM account a LEFT JOIN player p ON p.id=a.claimed_player_id WHERE a.claimed_player_id IS NOT NULL AND p.id IS NULL
    UNION ALL SELECT 1 FROM challenge_relation e JOIN challenge a ON a.id=e.from_id JOIN challenge b ON b.id=e.to_id
      WHERE a.scope <> 'map' OR b.scope <> 'map' OR a.map_id IS DISTINCT FROM b.map_id
    UNION ALL SELECT 1 FROM campaign_hall_map hm JOIN campaign_hall h ON h.id=hm.hall_id JOIN map m ON m.id=hm.map_id WHERE h.campaign_id<>m.campaign_id
    UNION ALL SELECT 1 FROM (
      SELECT account_id,device_id FROM tracker_cct_scope UNION ALL SELECT account_id,device_id FROM tracker_area_stats
      UNION ALL SELECT account_id,device_id FROM tracker_presence UNION ALL SELECT account_id,device_id FROM tracker_map_visit
    ) s JOIN tracker_device d ON d.id=s.device_id WHERE s.account_id<>d.account_id
    UNION ALL SELECT 1 FROM trash_item t WHERE NOT CASE t.kind
      WHEN 'record' THEN EXISTS(SELECT 1 FROM submission s WHERE s.id=t.target_id AND s.deleted_at IS NOT NULL)
      WHEN 'player' THEN EXISTS(SELECT 1 FROM player p WHERE p.id=t.target_id AND p.deleted_at IS NOT NULL)
      WHEN 'campaign' THEN EXISTS(SELECT 1 FROM campaign c WHERE c.id=t.target_id AND c.deleted_at IS NOT NULL)
      WHEN 'map' THEN EXISTS(SELECT 1 FROM map m WHERE m.id=t.target_id AND m.deleted_at IS NOT NULL)
      WHEN 'challenge' THEN EXISTS(SELECT 1 FROM challenge c WHERE c.id=t.target_id AND c.deleted_at IS NOT NULL) ELSE false END`);
  if (broken.rows.length) throw new Error("业务引用完整性校验失败");
  const cycles = await client.query(`WITH RECURSIVE walk AS (
    SELECT from_id, to_id, ARRAY[from_id,to_id] AS path, from_id=to_id AS cycle FROM challenge_relation
    UNION ALL SELECT w.from_id,e.to_id,w.path||e.to_id,e.to_id=ANY(w.path) FROM walk w JOIN challenge_relation e ON e.from_id=w.to_id WHERE NOT w.cycle
  ) SELECT 1 FROM walk WHERE cycle LIMIT 1`);
  if (cycles.rows.length) throw new Error("挑战 DAG 存在环");
  const unvalidated = await client.query("SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('f','c') AND NOT convalidated");
  if (unvalidated.rows.length) throw new Error("存在尚未验证的数据库约束");
  return { identityTables: true, references: true, dag: true };
}
if (process.argv[1]?.endsWith("check.ts")) { try { console.log(await checkDatabase(pool)); } finally { await pool.end(); } }
