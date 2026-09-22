import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import { db as productionDb } from "../src/db/client";
import { suggestionCommand } from "../src/modules/suggestions/suggestion-service";
import { listSuggestions } from "../src/modules/catalog/catalog";
import { suggestionChallengeIds } from "../../shared/src/suggestions";

test("拆分意见按 C/FC 有效成绩分组，修复历史回复且不按显示名认领", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    const db = drizzle(pg, { schema }) as unknown as typeof productionDb;
    await pg.exec(`
      INSERT INTO campaign(id,name,short_name) VALUES (1,'Pack','Pack');
      INSERT INTO map(id,campaign_id,name) VALUES (1,1,'Map'),(2,1,'Other');
      INSERT INTO challenge(id,scope,map_id,name,type) VALUES
        (1,'map',1,'C/FC','C/FC'),(2,'map',1,'Stronger','Other'),
        (3,'map',1,'Golden 1','Other'),(4,'map',2,'C/FC','C/FC');
      INSERT INTO challenge_relation_override(map_id) VALUES (1);
      INSERT INTO challenge_relation(from_id,to_id) VALUES (1,2);
      INSERT INTO player(id,name) VALUES (1,'Same name');
      INSERT INTO account(id,display_name,claimed_player_id) VALUES (1,'Account',1),(2,'Same name',null);
      INSERT INTO submission(id,player_id,challenge_id,status) VALUES (1,1,2,'accepted'),(2,1,2,'accepted');
      INSERT INTO suggestion(id,title,kind,state,source,map_id,due_at) VALUES
        (1,'Split','CHALLENGE','ONGOING','split',1,now()+interval '1 day');
      INSERT INTO suggestion_response(suggestion_id,account_id,player,progress,vote) VALUES
        (1,1,'Old name','未完成','FOR'),(1,null,'Same name','历史进度','AGAINST');
    `);
    const progress = async () => (await listSuggestions(db))[0].responses[0].progress;
    const vote = () => suggestionCommand(1, { vote: "FOR", progress: "已完成", playerId: 999 }, 1, db);
    assert.equal(await progress(), "已完成");
    assert.equal((await listSuggestions(db))[0].responses[1].progress, "历史进度");
    assert.equal((await vote()).ok, true);
    assert.equal((await pg.query<{ progress: string }>("SELECT progress FROM suggestion_response WHERE account_id=1")).rows[0].progress, "已完成");
    assert.equal((await listSuggestions(db))[0].votesFor, 1); // 两条记录仍为一票
    for (const change of [
      "UPDATE submission SET status='pending'",
      "UPDATE submission SET status='rejected'",
      "UPDATE submission SET status='hidden'",
      "UPDATE submission SET status='accepted',deleted_at=now()",
      "UPDATE submission SET deleted_at=null; INSERT INTO submission_tag(submission_id,kind,text) VALUES (1,'badge',E'\\tHidden\\n'),(2,'note','　HiDdEn　')",
    ]) {
      await pg.exec(change);
      assert.equal(await progress(), "未完成");
      assert.equal((await vote()).ok, true);
      assert.equal((await pg.query<{ progress: string }>("SELECT progress FROM suggestion_response WHERE account_id=1")).rows[0].progress, "未完成");
    }
    await pg.exec("DELETE FROM submission_tag");
    for (const table of ["player", "challenge", "map", "campaign"]) {
      await pg.exec(`UPDATE ${table} SET deleted_at=now()`);
      assert.equal(await progress(), "未完成");
      await pg.exec(`UPDATE ${table} SET deleted_at=null`);
      assert.equal(await progress(), "已完成");
    }
    await pg.exec("DELETE FROM challenge_relation"); // 显式空 DAG 不退回默认继承
    assert.equal(await progress(), "未完成");
    await pg.exec("UPDATE submission SET challenge_id=1");
    assert.equal(await progress(), "已完成");
    for (const id of [3, 4]) {
      await pg.exec(`UPDATE submission SET challenge_id=${id}`);
      assert.equal(await progress(), "未完成");
    }
    await pg.exec("UPDATE submission SET challenge_id=1; UPDATE account SET claimed_player_id=null WHERE id=1");
    assert.equal(await progress(), "未完成");
    assert.equal((await suggestionCommand(2, { vote: "FOR", playerId: 1 }, 1, db)).ok, true);
    assert.equal((await listSuggestions(db))[0].responses.at(-1)?.progress, "未完成");
    await pg.exec("UPDATE account SET claimed_player_id=1 WHERE id=1; DELETE FROM challenge_relation_override; UPDATE challenge SET name='C/FC [No DTS]' WHERE id=2; UPDATE submission SET challenge_id=2");
    assert.equal(await progress(), "已完成"); // 默认限定挑战继承
    await pg.exec("INSERT INTO suggestion(id,title,kind,state,source,challenge_id,due_at) VALUES (2,'Placement','CHALLENGE','ONGOING','placement',1,now()+interval '1 day')");
    assert.equal((await suggestionCommand(1, { vote: "FOR" }, 2, db)).ok, true);
    assert.equal((await listSuggestions(db))[1].responses[0].progress, "已完成");
    const nodes = [{ id: 1, mapId: 1, type: "C/FC" }, { id: 2, mapId: 1, type: "Other" }, { id: 3, mapId: 2, type: "C/FC" }];
    assert.deepEqual(suggestionChallengeIds({ source: "split", mapId: 1 }, nodes), [1]);
    assert.deepEqual(suggestionChallengeIds({ source: "placement", challengeId: 2 }, nodes), [2]);
  } finally { await pg.close(); }
});
