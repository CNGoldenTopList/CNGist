import { sql } from "drizzle-orm";
import { dailySummaryWindow } from "../../../../shared/src/daily-summary";
import { trimWhitespace } from "../catalog/site-stats-query";

/** 直接记录一条一行，不展开 DAG，也不把同一玩家的多次实际提交合并。 */
export function dailySummaryQuery(date: string) {
  const { from, to } = dailySummaryWindow(date);
  return sql`
    select s.id, s.player_id as "playerId", p.name as "playerName",
      c.id as "challengeId", c.name as "challengeName", coalesce(c.tier_code, 'undetermined') as tier,
      m.id as "mapId", m.name as "mapName", m.cn_name as "mapCnName",
      pack.id as "campaignId", pack.name as "campaignName", pack.cn_name as "campaignCnName",
      s.accepted_at as "acceptedAt"
    from submission s
    join player p on p.id = s.player_id and p.deleted_at is null
    join challenge c on c.id = s.challenge_id and c.deleted_at is null
    left join map m on c.scope = 'map' and m.id = c.map_id
    join campaign pack on pack.id = case when c.scope = 'map' then m.campaign_id else c.campaign_id end
      and pack.deleted_at is null
    where s.status = 'accepted' and s.deleted_at is null
      and (c.scope = 'campaign' or m.deleted_at is null)
      and s.accepted_at >= ${from}::timestamptz and s.accepted_at < ${to}::timestamptz
      and not exists (select 1 from submission_tag t where t.submission_id = s.id
        and lower(btrim(t.text, ${trimWhitespace})) = 'hidden')
    order by s.accepted_at, s.id
  `;
}
