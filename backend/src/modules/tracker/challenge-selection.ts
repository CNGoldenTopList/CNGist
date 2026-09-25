import { entityId } from "../../../../shared/src/entity-id";
import { CctError } from "./cct-state";
import type { CctPrincipal, CctSql } from "./cct-repository";

/** 当前挑战 SQL 片段：玩家明确选择（仍为该地图有效的地图挑战）优先；地图只有一个有效挑战时视为已选；否则 NULL。
 *  NULL 表示「没有选择」，调用方沿用选择功能之前的行为。account/map 为调用处 SQL 中的列或参数表达式。 */
export function selectedChallengeSql(account: string, map: string) {
  return `COALESCE(
    (SELECT s.challenge_id FROM tracker_challenge_selection s
      JOIN challenge sc ON sc.id=s.challenge_id AND sc.map_id=s.map_id AND sc.scope='map' AND sc.deleted_at IS NULL
      WHERE s.account_id=${account} AND s.map_id=${map}),
    (SELECT min(oc.id) FROM challenge oc WHERE oc.map_id=${map} AND oc.scope='map' AND oc.deleted_at IS NULL HAVING count(*)=1))`;
}

/** 设备上报玩家选择；challengeId 为 null 时清除。只接受该地图的有效地图挑战，身份来自设备凭据。 */
export async function saveChallengeSelection(sql: CctSql, p: CctPrincipal, body: Record<string, unknown>) {
  // Mod 本地以字符串保存目录 ID；两种形式都接受，但必须是正整数。
  const numeric = (v: unknown) => typeof v === "string" && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : v;
  let mapId: number | null, challengeId: number | null;
  try { mapId = entityId(numeric(body.mapId)); challengeId = entityId(numeric(body.challengeId)); }
  catch { throw new CctError("invalid_challenge_selection"); }
  if (mapId === null) throw new CctError("invalid_challenge_selection");
  const storage = await sql.query("SELECT enabled, history_epoch FROM tracker_cct_storage WHERE account_id=$1", [p.accountId]);
  if (!storage.rows[0]?.enabled || storage.rows[0].history_epoch !== p.historyEpoch) throw new CctError("history_epoch_invalid");
  if (challengeId === null) {
    await sql.query("DELETE FROM tracker_challenge_selection WHERE account_id=$1 AND map_id=$2", [p.accountId, mapId]);
    return { mapId, challengeId: null };
  }
  const valid = await sql.query(`SELECT 1 FROM challenge ch JOIN map m ON m.id=ch.map_id AND m.deleted_at IS NULL
    JOIN campaign c ON c.id=m.campaign_id AND c.deleted_at IS NULL
    WHERE ch.id=$1 AND ch.map_id=$2 AND ch.scope='map' AND ch.deleted_at IS NULL`, [challengeId, mapId]);
  if (!valid.rows.length) throw new CctError("invalid_challenge_selection");
  await sql.query(`INSERT INTO tracker_challenge_selection(account_id,map_id,challenge_id) VALUES($1,$2,$3)
    ON CONFLICT(account_id,map_id) DO UPDATE SET challenge_id=EXCLUDED.challenge_id, updated_at=now()`, [p.accountId, mapId, challengeId]);
  return { mapId, challengeId };
}

/** overlay-context 返回的明确选择；不含单挑战推断，Mod 本地已处理。 */
export async function readChallengeSelection(sql: CctSql, accountId: number, mapId: number): Promise<number | null> {
  const { rows } = await sql.query(`SELECT s.challenge_id FROM tracker_challenge_selection s
    JOIN tracker_cct_storage st ON st.account_id=s.account_id AND st.enabled
    JOIN challenge ch ON ch.id=s.challenge_id AND ch.map_id=s.map_id AND ch.scope='map' AND ch.deleted_at IS NULL
    WHERE s.account_id=$1 AND s.map_id=$2`, [accountId, mapId]);
  return rows[0] ? Number(rows[0].challenge_id) : null;
}
