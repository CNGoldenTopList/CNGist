import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { saveWishlistPing } from "../src/modules/tracker/wishlist-ping";
import { captureBerryCollection, claimGoldenRoomEvent, parseBerryCollection } from "../src/modules/tracker/golden-room-alerts";
import { createPresenceRepository } from "../src/modules/tracker/presence";
import type { CctSql } from "../src/modules/tracker/cct-repository";

test("金/银草莓收集：仅 Ping 点玩家、同面一条、eventId 幂等、合并挑战名；presence start 记录版本", async () => {
  const pg = new PGlite();
  const epoch = "22222222-2222-4222-8222-222222222222";
  const principal = { accountId: 1, deviceId: 1, historyEpoch: epoch };
  const tx = <T>(work: (sql: CctSql) => Promise<T>) => pg.transaction(t => work(t as unknown as CctSql));
  const berry = (eventId: string, extra: Record<string, unknown> = {}, p = principal) =>
    tx(sql => captureBerryCollection(sql, p, parseBerryCollection({ eventId, sid: "Test/SID", side: "Normal", berry: "golden", ...extra })));
  const events = async () => (await pg.query<{ kind: string }>("SELECT kind FROM golden_room_event ORDER BY id")).rows.map(r => r.kind);
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    await pg.exec(`
      INSERT INTO player(id,name) VALUES(1,'One'),(2,'Two');
      INSERT INTO account(id,display_name,claimed_player_id) VALUES(1,'One',1),(2,'Two',2);
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO map(id,name,campaign_id) VALUES(1,'Map',1);
      INSERT INTO challenge(id,scope,map_id,name,tier_code) VALUES(1,'map',1,'C','t7'),(2,'map',1,'FC','h3');
      INSERT INTO wishlist_entry(id,account_id,challenge_id) VALUES(1,1,1),(2,1,2);
      INSERT INTO tracker_device(id,account_id,name,token_hash) VALUES(1,1,'Device','hash'),(2,2,'Other','other');
      INSERT INTO tracker_cct_storage(account_id,enabled,history_epoch) VALUES(1,true,'${epoch}'),(2,true,'${epoch}');
      INSERT INTO tracker_map_binding(sid,side,map_id,status) VALUES('Test/SID','Normal',1,'approved');
      INSERT INTO tracker_cct_scope(account_id,device_id,dataset_id,sid,side,segment_key,stream_epoch,revision,state_hash,last_mutation_id,last_mutation_hash,metadata)
      VALUES(1,1,'33333333-3333-4333-8333-333333333333','Test/SID','Normal','full','44444444-4444-4444-8444-444444444444',1,repeat('a',64),'55555555-5555-4555-8555-555555555555',repeat('b',64),
        '{"cctVersion":"2.10.2","adapterVersion":"test","cctSessionKey":"s1","settings":{"selectedAttemptCount":20,"trackNegativeStreaks":true},"chapter":{"goldenCollectedCount":0,"goldenCollectedCountSession":0},"route":{"ignoredRooms":[],"checkpoints":[{"checkpointKey":"cp"}],"nodes":[{"roomKey":"end","checkpointKey":"cp","groupedRooms":[],"isNonGameplayRoom":false}]}}');
    `);
    assert.throws(() => parseBerryCollection({ eventId: "66666666-6666-4666-8666-666666666666", sid: "Test/SID", side: "Normal", berry: "moon" }), /invalid_berry/);
    // 未设置 Ping 点不推送
    assert.equal((await berry("66666666-6666-4666-8666-666666666661")).notified, false);
    assert.deepEqual(await events(), []);
    const point = { sid: "Test/SID", side: "Normal", roomKey: "end" };
    await tx(sql => saveWishlistPing(sql, 1, { wishId: 1, point }));
    await tx(sql => saveWishlistPing(sql, 1, { wishId: 2, point }));
    // 两条规则只产生一条事件，重试同一 eventId 不重复
    await berry("66666666-6666-4666-8666-666666666662");
    await berry("66666666-6666-4666-8666-666666666662");
    assert.deepEqual(await events(), ["golden"]);
    await berry("66666666-6666-4666-8666-666666666663", { side: "BSide" });
    assert.deepEqual(await events(), ["golden"]);
    // 其他账户的 Ping 点不影响
    await berry("66666666-6666-4666-8666-666666666664", {}, { ...principal, accountId: 2, deviceId: 2 });
    assert.deepEqual(await events(), ["golden"]);
    const claimed = await tx(claimGoldenRoomEvent);
    assert.equal(claimed?.kind, "golden");
    assert.equal(claimed?.challengeName, "C / FC");
    await berry("66666666-6666-4666-8666-666666666665", { berry: "silver" });
    assert.equal((await tx(claimGoldenRoomEvent))?.kind, "silver");
    await pg.exec("UPDATE player SET ping_disabled=true WHERE id=1");
    await berry("66666666-6666-4666-8666-666666666666");
    assert.deepEqual(await events(), ["golden", "silver"]);
    await pg.exec("UPDATE tracker_cct_storage SET enabled=false WHERE account_id=1");
    await assert.rejects(berry("66666666-6666-4666-8666-666666666667"), /history_epoch_invalid/);

    await pg.exec("UPDATE tracker_cct_storage SET enabled=true WHERE account_id=1");
    const presence = createPresenceRepository(tx);
    await presence.write(principal, { action: "start", clientVersion: "0.3.0" });
    await presence.write(principal, { action: "start", clientVersion: "<script>" });
    await presence.write(principal, { action: "start" });
    assert.equal((await pg.query<{ v: string }>("SELECT client_version AS v FROM tracker_device WHERE id=1")).rows[0].v, "0.3.0");
  } finally { await pg.close(); }
});
