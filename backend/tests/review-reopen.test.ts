import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { Tx } from "../src/modules/admin/audit";
import { commandScope } from "../src/modules/admin/transaction";
import { reviewSubmission, type ReviewInput } from "../src/modules/records/commands";

const admin = { id: 1, displayName: "管理员", role: "admin" as const };

test("审核回退清除通过标记，保留内容和其他记录，并可再次通过", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) {
      await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    }
    const db = drizzle(pg, { schema });
    await pg.exec(`
      INSERT INTO account(id,display_name,role) VALUES(1,'管理员','admin');
      INSERT INTO player(id,name) VALUES(1,'玩家');
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO map(id,campaign_id,name) VALUES(1,1,'Map');
      INSERT INTO challenge(id,scope,map_id,name,tier_code) VALUES(1,'map',1,'C','t7');
      INSERT INTO submission(id,challenge_id,player_id,status,verified,video_url,reviewed_by,reviewed_at,reviewing_by,reviewing_at)
        VALUES(1,1,1,'accepted',true,'https://example.test/video',1,now(),1,now()),
              (2,1,1,'hidden',true,'https://example.test/video',1,now(),null,null),
              (3,1,1,'accepted',true,'https://example.test/video',1,now(),null,null);
      UPDATE submission SET deleted_at=now() WHERE id=3;
      INSERT INTO submission_tag(submission_id,kind,text) VALUES(1,'badge','FC');
    `);
    const review = (id: number, input: ReviewInput) => db.transaction(tx =>
      commandScope.run(tx as unknown as Tx, () => reviewSubmission(admin, id, input)));
    const rows = () => pg.query("SELECT * FROM submission ORDER BY id");
    const before = (await rows()).rows;
    assert.equal((await review(1, { status: "pending", retainedIds: [] })).ok, false);
    assert.equal((await review(1, { status: "pending", challengeId: 1 })).ok, false);
    assert.deepEqual((await rows()).rows, before);
    assert.equal((await review(1, { status: "pending" })).ok, true);
    const after = (await rows()).rows;
    assert.deepEqual(after[0], { ...before[0], status: "pending", verified: false,
      reviewed_by: null, reviewed_at: null, reviewing_by: null, reviewing_at: null, reviewing_note: null });
    assert.deepEqual(after.slice(1), before.slice(1));
    assert.deepEqual((await pg.query("SELECT text FROM submission_tag WHERE submission_id=1")).rows, [{ text: "FC" }]);
    assert.equal((await pg.query("SELECT * FROM audit_log")).rows.length, 1);
    assert.equal((await review(1, { status: "pending" })).ok, false);
    assert.equal((await review(3, { status: "pending" })).ok, false);
    assert.equal((await review(2, { status: "pending" })).ok, true);
    assert.equal((await review(1, { status: "accepted" })).ok, true);
    const accepted = (await rows()).rows[0];
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.verified, true);
    assert.equal(accepted.reviewed_by, 1);
    assert.equal((await pg.query("SELECT * FROM audit_log")).rows.length, 3);
  } finally {
    await pg.close();
  }
});
