import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { dailySummaryQuery } from "../src/modules/daily-summary/query";
import { dailySummaryWindow, latestDailySummaryDate, dailySummaryImagePages, type DailySummaryRecord } from "../../shared/src/daily-summary";

const folder = new URL("../drizzle/", import.meta.url);
async function migrate(pg: PGlite, before = false) {
  for (const file of readdirSync(folder).filter(f => f.endsWith(".sql") && (!before || f < "0003")).sort()) await pg.exec(readFileSync(new URL(file, folder), "utf8"));
}
const fixture = `
  INSERT INTO player(id,name) VALUES(1,'玩家');
  INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
  INSERT INTO map(id,campaign_id,name) VALUES(1,1,'Map');
  INSERT INTO challenge(id,scope,map_id,campaign_id,name,tier_code) VALUES
    (1,'map',1,null,'C','t7'), (2,'map',1,null,'FC','h0'),
    (3,'campaign',null,1,'Pack C','low-std');
  INSERT INTO challenge_relation(from_id,to_id) VALUES(2,1);
`;

test("总结窗口使用北京时间 22:30，跨日、跨月和非法日期", () => {
  assert.deepEqual(dailySummaryWindow("2026-09-22"), {date: "2026-09-22", from: "2026-09-21T14:30:00.000Z", to: "2026-09-22T14:30:00.000Z"});
  assert.equal(dailySummaryWindow("2026-03-01").from, "2026-02-28T14:30:00.000Z");
  assert.equal(latestDailySummaryDate(new Date("2026-09-22T14:29:59Z")), "2026-09-21");
  assert.equal(latestDailySummaryDate(new Date("2026-09-22T14:30:00Z")), "2026-09-22");
  assert.equal(latestDailySummaryDate(new Date("2026-09-22T16:01:00Z")), "2026-09-22");
  for (const date of ["2026-02-30", "2026-13-01", "2026-9-22", "x"]) assert.throws(() => dailySummaryWindow(date));
});

test("通过时间迁移：回填、自动通过、退回重审、普通编辑与伪造时间", async () => {
  const pg = new PGlite();
  try {
    await migrate(pg, true); await pg.exec(fixture);
    await pg.exec(`INSERT INTO submission(id,player_id,challenge_id,status,created_at,reviewed_at) VALUES
      (1,1,1,'accepted','2026-09-01Z','2026-09-22T01:00:00Z'),
      (2,1,3,'accepted','2026-09-22T02:00:00Z',null),
      (3,1,3,'pending','2026-09-01Z',null);`);
    await pg.exec(readFileSync(new URL("0003_daily_summary.sql", folder), "utf8"));
    const acceptedAt = async (id: number) => (await pg.query<{at: string | null}>("select accepted_at::text as at from submission where id=$1", [id])).rows[0].at;
    assert.equal(Date.parse((await acceptedAt(1))!), Date.parse("2026-09-22T01:00:00Z"));
    assert.equal(Date.parse((await acceptedAt(2))!), Date.parse("2026-09-22T02:00:00Z"));
    assert.equal(await acceptedAt(3), null);
    await pg.exec("UPDATE submission SET status='accepted' WHERE id=3");
    const autoTime = await acceptedAt(3); assert.ok(autoTime);
    await pg.exec("UPDATE submission SET reviewed_at='2000-01-01Z',accepted_at='2000-01-01Z' WHERE id=3");
    assert.equal(await acceptedAt(3), autoTime);
    await pg.exec("UPDATE submission SET status='pending' WHERE id=3");
    await pg.exec("UPDATE submission SET status='accepted', reviewed_at=null WHERE id=3");
    assert.notEqual(await acceptedAt(3), autoTime);
    assert.equal((await pg.query("SELECT reviewed_at FROM submission WHERE id=3")).rows[0].reviewed_at, null);
    await pg.exec("INSERT INTO submission(id,player_id,challenge_id,status,created_at,reviewed_at) VALUES(4,1,3,'accepted','2000-01-01Z','2000-01-01Z')");
    assert.ok(Date.parse((await acceptedAt(4))!) > Date.parse('2026-01-01Z'));

    const first = await pg.query("INSERT INTO daily_summary_delivery(summary_date,group_id) VALUES('2026-09-22','100') ON CONFLICT DO NOTHING RETURNING id");
    assert.equal(first.rows.length, 1);
    assert.equal((await pg.query("INSERT INTO daily_summary_delivery(summary_date,group_id) VALUES('2026-09-22','100') ON CONFLICT DO NOTHING RETURNING id")).rows.length, 0);
  } finally { await pg.close(); }
});

test("公开总结：左右边界、所有实际记录、无 DAG 派生、隐藏与各级软删除", async () => {
  const pg = new PGlite();
  try {
    await migrate(pg, true); await pg.exec(fixture);
    await pg.exec(`INSERT INTO submission(id,player_id,challenge_id,status,reviewed_at,created_at) VALUES
      (1,1,1,'accepted','2026-09-21T14:29:59Z',now()),
      (2,1,2,'accepted','2026-09-21T14:30:00Z',now()),
      (3,1,2,'accepted','2026-09-22T14:29:59Z',now()),
      (4,1,1,'accepted','2026-09-22T14:30:00Z',now()),
      (5,1,3,'accepted',null,'2026-09-22T01:00:00Z'),
      (6,1,1,'hidden','2026-09-22T01:00:00Z',now()),
      (7,1,1,'pending',null,now()),
      (8,1,1,'accepted','2026-09-22T01:00:00Z',now());
      INSERT INTO submission_tag(submission_id,kind,text) VALUES(8,'badge',E'　\\tHiDdEn\\n');`);
    await pg.exec(readFileSync(new URL("0003_daily_summary.sql", folder), "utf8"));
    const read = async () => { const q = new PgDialect().sqlToQuery(dailySummaryQuery("2026-09-22")); return (await pg.query<DailySummaryRecord>(q.sql,q.params)).rows; };
    assert.deepEqual((await read()).map(r => r.id), [2,5,3]);
    assert.deepEqual((await read()).map(r => r.challengeId), [2,3,2]);
    await pg.exec("UPDATE submission SET deleted_at=now() WHERE id=2");
    assert.deepEqual((await read()).map(r => r.id), [5,3]);
    await pg.exec("UPDATE map SET deleted_at=now() WHERE id=1");
    assert.deepEqual((await read()).map(r => r.id), [5]);
    await pg.exec("UPDATE challenge SET deleted_at=now() WHERE id=3");
    assert.equal((await read()).length, 0);
    await pg.exec("UPDATE challenge SET deleted_at=null; UPDATE map SET deleted_at=null; UPDATE player SET deleted_at=now()");
    assert.equal((await read()).length, 0);
    await pg.exec("UPDATE player SET deleted_at=null; UPDATE campaign SET deleted_at=now()");
    assert.equal((await read()).length, 0);
  } finally { await pg.close(); }
});

test("机器人图片排除 Std，按难度由高到低，每张至多 10 条", () => {
  const records = Array.from({length: 22}, (_, i) => ({id: i, tier: i === 0 ? 'h0' : i === 1 ? 'low-std' : i === 2 ? 'undetermined' : 't7', acceptedAt: String(i).padStart(3,'0')} as DailySummaryRecord));
  const pages = dailySummaryImagePages(records.reverse());
  assert.deepEqual(pages.map(p => p.length), [10,10,1]);
  assert.equal(pages[0][0].tier, 'h0'); assert.equal(pages[2][0].tier, 'undetermined');
  assert.equal(pages.flat().some(r => r.tier === 'low-std'), false);
});
