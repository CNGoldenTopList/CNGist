import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { siteStatsQuery, type SiteStats } from "../src/modules/catalog/site-stats-query";
import { requestContext, type RequestContext } from "../src/plugins/http";
import { setCatalogCache, type CatalogData } from "../src/modules/catalog/catalog-cache";
import { clearCount, playerSubmissions, submissionsForChallenge, type RecordOverlay } from "../src/modules/catalog/projection";

// 使用正式迁移验证聚合，不连接运行中的数据库。
test("stats 保留目录可见性、两个作用域和玩家/挑战去重", async () => {
  const db = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, folder), "utf8"));
    const query = new PgDialect().sqlToQuery(siteStatsQuery);
    const stats = async () => (await db.query<SiteStats>(query.sql, query.params)).rows[0];
    assert.deepEqual(await stats(), { campaigns: 0, maps: 0, players: 0, records: 0 });
    await db.exec(`
      INSERT INTO campaign(id,name,short_name,is_standalone,deleted_at) VALUES
        (1,'Pack','Pack',false,null),(2,'Single','Single',true,null),(3,'Deleted','Deleted',false,now());
      INSERT INTO map(id,campaign_id,name,deleted_at) VALUES
        (1,1,'Map',null),(2,1,'Deleted map',now()),(3,3,'Deleted parent',null);
      INSERT INTO player(id,name,deleted_at) VALUES (1,'A',null),(2,'B',null),(3,'Deleted',now());
      INSERT INTO challenge(id,scope,map_id,campaign_id,name,deleted_at) VALUES
        (1,'map',1,null,'C',null),(2,'map',1,null,'FC',null),(3,'campaign',null,1,'Pack C',null),
        (4,'map',1,null,'Deleted',now()),(5,'map',2,null,'Deleted map',null),
        (6,'map',3,null,'Deleted parent',null),(7,'campaign',null,3,'Deleted pack',null);
      INSERT INTO submission(id,player_id,challenge_id,status,deleted_at,proposed_target) VALUES
        (1,1,1,'accepted',null,null),(2,1,1,'accepted',null,null),(3,1,2,'accepted',null,null),
        (4,1,3,'accepted',null,null),(5,2,1,'accepted',null,null),
        (6,2,2,'accepted',null,null),(7,2,3,'accepted',null,null),
        (8,3,1,'accepted',null,null),(9,1,4,'accepted',null,null),
        (10,1,5,'accepted',null,null),(11,1,6,'accepted',null,null),(12,1,7,'accepted',null,null),
        (13,2,2,'hidden',null,null),(14,2,2,'accepted',now(),null),
        (15,2,2,'pending',null,null),(16,2,2,'rejected',null,null),(17,2,null,'pending',null,'{}');
      INSERT INTO submission_tag(submission_id,kind,text) VALUES
        (5,'mark','Hidden'),(6,'badge',E'\\tHiDdEn\\n'),(7,'note','　Hidden　'),
        (3,'badge','RAW'),(3,'badge','月莓'),(3,'badge','FC'),(3,'note','moon');
    `);
    assert.deepEqual(await stats(), { campaigns: 2, maps: 1, players: 2, records: 4 });
    await db.exec("UPDATE challenge SET deleted_at=now() WHERE id=1");
    assert.equal((await stats()).records, 2);
    await db.exec("UPDATE challenge SET deleted_at=null WHERE id=1; UPDATE map SET deleted_at=now() WHERE id=1");
    assert.deepEqual(await stats(), { campaigns: 2, maps: 0, players: 2, records: 1 });
    await db.exec("UPDATE map SET deleted_at=null WHERE id=1; UPDATE campaign SET deleted_at=now() WHERE id=1");
    assert.deepEqual(await stats(), { campaigns: 1, maps: 0, players: 2, records: 0 });
    await db.exec("UPDATE campaign SET deleted_at=null WHERE id=1; UPDATE player SET deleted_at=now() WHERE id=1");
    assert.deepEqual(await stats(), { campaigns: 2, maps: 1, players: 1, records: 1 });
    await db.exec("UPDATE player SET deleted_at=null WHERE id=1; DELETE FROM submission_tag WHERE submission_id=6");
    assert.equal((await stats()).records, 5);
  } finally { await db.close(); }
});

function fixture(): CatalogData {
  return {
    campaigns: [], maps: [], players: [], suggestions: [], campaignHalls: [], campaignOrders: {},
    campaignMenu: { fixed: [], favorites: [] }, challengeRelations: {},
    challenges: [
      { id: 1, mapId: 1, name: 'C', type: 'C', tier: 't7', clearCount: 0, description: '' },
      { id: 2, mapId: 1, name: 'FC', type: 'FC', tier: 't6', clearCount: 0, description: '' },
      { id: 3, mapId: 2, name: 'C/FC', type: 'C/FC', tier: 't7', clearCount: 0, description: '' },
    ],
    multiMapChallenges: [{ id: 4, campaignId: 1, name: 'Pack C', clearCount: 0, tier: 't7' }],
    submissions: [
      { id: 1, challengeId: 2, playerId: 1, achievedAt: '2026-01-01', videoUrl: 'fc-old', status: 'accepted', tags: ['RAW', '月莓', 'FC', 'moon'], recommends: true, opinionTier: 't6' },
      { id: 2, challengeId: 3, playerId: 2, achievedAt: '', videoUrl: 'other-map', status: 'accepted' },
      { id: 3, challengeId: 1, playerId: 1, achievedAt: '2025-01-01', videoUrl: 'clear', status: 'accepted' },
      { id: 4, challengeId: 2, playerId: 2, achievedAt: '', videoUrl: 'fc', status: 'accepted' },
      { id: 5, challengeId: 2, playerId: 1, achievedAt: '2026-02-01', videoUrl: 'fc-new', status: 'accepted' },
      { id: 6, challengeId: 4, playerId: 1, achievedAt: '', videoUrl: 'pack', status: 'accepted' },
      { id: 7, challengeId: 2, playerId: 3, achievedAt: '', videoUrl: 'hidden', status: 'accepted', tags: [' Hidden '] },
    ],
  };
}

test("投影索引保留顺序、直接成绩优先、跨 Tier C/FC、同义标签及目录刷新", () => {
  requestContext.run({ cache: new Map() } as RequestContext, () => {
    setCatalogCache(fixture());
    assert.equal(clearCount(1), 2);
    const records = submissionsForChallenge(1);
    assert.deepEqual(records.map(r => r.id), [3, 4]);
    assert.equal(records[1].inheritedFromChallengeId, 2);
    assert.equal(records[1].recommends, undefined);
    assert.equal(records[1].opinionTier, undefined);
    assert.deepEqual(submissionsForChallenge(2).map(r => r.id), [1, 5, 4]);
    assert.deepEqual(submissionsForChallenge(2)[0].tags, ['月莓']);
    assert.deepEqual(playerSubmissions(1).map(r => r.id), [5, 3, 6]);
    assert.deepEqual(submissionsForChallenge(4).map(r => r.id), [6]);
    const overlay = { records: [{ id: 5, challengeId: 2, playerId: 1, status: 'hidden' }] } as RecordOverlay;
    assert.deepEqual(playerSubmissions(1, overlay).map(r => r.id), [1, 3, 6]);
    assert.deepEqual(playerSubmissions(1).map(r => r.id), [5, 3, 6]);
    const fresh = fixture();
    fresh.submissions = fresh.submissions.filter(r => r.challengeId !== 2);
    fresh.challengeRelations = { 1: [] };
    setCatalogCache(fresh);
    assert.equal(clearCount(1), 1);
    assert.equal(clearCount(2), 0);
    assert.deepEqual(submissionsForChallenge(1).map(r => r.id), [3]);
  });
});
