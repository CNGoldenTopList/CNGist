import { sql } from "drizzle-orm";

export type SiteStats = { campaigns: number; maps: number; players: number; records: number };

// 与公开目录的 String.trim() 保持相同的首尾空白处理。
export const trimWhitespace = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

/** 只聚合有效直接成绩，不展开 DAG；两个挑战作用域分别校验父级。 */
export const siteStatsQuery = sql`
  with visible_campaigns as (
    select id from campaign where deleted_at is null
  ), visible_maps as (
    select m.id from map m join visible_campaigns c on c.id = m.campaign_id
    where m.deleted_at is null
  ), visible_players as (
    select id from player where deleted_at is null
  ), visible_challenges as (
    select c.id from challenge c
    where c.deleted_at is null and (
      (c.scope = 'map' and c.map_id in (select id from visible_maps)) or
      (c.scope = 'campaign' and c.campaign_id in (select id from visible_campaigns))
    )
  )
  select
    (select count(*)::integer from visible_campaigns) as campaigns,
    (select count(*)::integer from visible_maps) as maps,
    (select count(*)::integer from visible_players) as players,
    (select count(distinct (s.player_id, s.challenge_id))::integer
     from submission s
     join visible_players p on p.id = s.player_id
     join visible_challenges c on c.id = s.challenge_id
     where s.status = 'accepted' and s.deleted_at is null
       and not exists (
         select 1 from submission_tag t where t.submission_id = s.id
         and t.kind in ('badge', 'note')
         and lower(btrim(t.text, ${trimWhitespace})) = 'hidden'
       )) as records
`;
