import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { saveWishlistPing } from "../src/modules/tracker/wishlist-ping";
import { captureBerryCollection, captureGoldenRoomEntry, claimGoldenRoomEvent, parseBerryCollection } from "../src/modules/tracker/golden-room-alerts";
import { readChallengeSelection, saveChallengeSelection } from "../src/modules/tracker/challenge-selection";
import { readOnlinePlayers } from "../src/modules/tracker/online";
import type { CctSql } from "../src/modules/tracker/cct-repository";
import type { LiveObservation } from "../src/modules/tracker/presence";

test("当前挑战：严格相等过滤 Ping 点与草莓推送，没有选择保持原行为，在线列表优先明确选择", async () => {
  const pg = new PGlite();
  const epoch = "22222222-2222-4222-8222-222222222222";
  const principal = { accountId: 1, deviceId: 1, historyEpoch: epoch };
  const tx = <T>(work: (sql: CctSql) => Promise<T>) => pg.transaction(t => work(t as unknown as CctSql));
  const select = (challengeId: unknown, mapId: unknown = 1) => tx(sql => saveChallengeSelection(sql, principal, { mapId, challengeId }));
  const at = (room: string): LiveObservation => ({ sid: "Test/SID", side: "Normal", room, holdingGolden: true,
    paused: false, transitioning: false, cctAvailable: true, cctTrackingPaused: false });
  const enter = async () => { await tx(sql => captureGoldenRoomEntry(sql, principal, at("start"))); await tx(sql => captureGoldenRoomEntry(sql, principal, at("end"))); };
  let eventNo = 0;
  const berry = () => tx(sql => captureBerryCollection(sql, principal, parseBerryCollection({
    eventId: `66666666-6666-4666-8666-${String(++eventNo).padStart(12, "0")}`, sid: "Test/SID", side: "Normal", berry: "golden" })));
  const events = async () => (await pg.query<{ kind: string; challenge_id: number | null }>(
    "SELECT kind, challenge_id FROM golden_room_event ORDER BY id")).rows;
  const clear = () => pg.exec("DELETE FROM golden_room_event");
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    await pg.exec(`
      INSERT INTO player(id,name) VALUES(1,'One');
      INSERT INTO account(id,display_name,claimed_player_id) VALUES(1,'One',1);
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO map(id,name,campaign_id) VALUES(1,'Map',1),(2,'Other',1),(3,'Solo',1);
      INSERT INTO challenge(id,scope,map_id,name,tier_code) VALUES(1,'map',1,'C','t7'),(2,'map',1,'FC','h3'),(3,'map',1,'[No DTS] C','l3'),
        (4,'map',2,'C','t7'),(5,'map',3,'Only','t6');
      INSERT INTO wishlist_entry(id,account_id,challenge_id) VALUES(1,1,1),(2,1,2);
      INSERT INTO tracker_device(id,account_id,name,token_hash) VALUES(1,1,'Device','hash');
      INSERT INTO tracker_cct_storage(account_id,enabled,history_epoch) VALUES(1,true,'${epoch}');
      INSERT INTO tracker_map_binding(sid,side,map_id,status) VALUES('Test/SID','Normal',1,'approved');
      INSERT INTO tracker_cct_scope(account_id,device_id,dataset_id,sid,side,segment_key,stream_epoch,revision,state_hash,last_mutation_id,last_mutation_hash,metadata)
      VALUES(1,1,'33333333-3333-4333-8333-333333333333','Test/SID','Normal','full','44444444-4444-4444-8444-444444444444',1,repeat('a',64),'55555555-5555-4555-8555-555555555555',repeat('b',64),
        '{"cctVersion":"2.10.2","adapterVersion":"test","cctSessionKey":"s1","settings":{"selectedAttemptCount":20,"trackNegativeStreaks":true},"chapter":{"goldenCollectedCount":0,"goldenCollectedCountSession":0},"route":{"ignoredRooms":[],"checkpoints":[{"checkpointKey":"cp"}],"nodes":[{"roomKey":"start","checkpointKey":"cp","groupedRooms":[],"isNonGameplayRoom":false},{"roomKey":"end","checkpointKey":"cp","groupedRooms":[],"isNonGameplayRoom":false}]}}');
    `);
    const point = { sid: "Test/SID", side: "Normal", roomKey: "end" };
    await tx(sql => saveWishlistPing(sql, 1, { wishId: 1, point }));
    await tx(sql => saveWishlistPing(sql, 1, { wishId: 2, point }));

    // 选择校验：只接受该地图的有效地图挑战，字符串 ID 与数字 ID 等价。
    await assert.rejects(select(4), /invalid_challenge_selection/);
    await assert.rejects(select(1, "abc"), /invalid_challenge_selection/);
    await assert.rejects(select(99), /invalid_challenge_selection/);
    assert.deepEqual(await select("2", "1"), { mapId: 1, challengeId: 2 });
    assert.equal(await tx(sql => readChallengeSelection(sql, 1, 1)), 2);

    // 没有选择：两个 Ping 点各发一条（原行为）。
    await select(null);
    assert.equal(await tx(sql => readChallengeSelection(sql, 1, 1)), null);
    await enter();
    assert.deepEqual((await events()).map(e => e.challenge_id), [null, null]);
    await clear();
    // 选择 FC：只有 FC 的 Ping 点触发，并记录选择。
    await select(2); await enter();
    assert.deepEqual(await events(), [{ kind: "room", challenge_id: 2 }]);
    assert.equal((await tx(claimGoldenRoomEvent))?.challengeName, "FC");
    await clear();
    // 选择没有 Ping 点的挑战：不推送。
    await select(3); await enter();
    assert.deepEqual(await events(), []);

    // 草莓：有选择且设了 Ping 点 → 只写该挑战；选了没有 Ping 点的挑战 → 不推送；没有选择 → 合并。
    assert.equal((await berry()).notified, false);
    await select(1);
    assert.equal((await berry()).notified, true);
    const selected = await tx(claimGoldenRoomEvent);
    assert.equal(selected?.kind, "golden"); assert.equal(selected?.challengeName, "C");
    await clear(); await select(null); await berry();
    assert.equal((await tx(claimGoldenRoomEvent))?.challengeName, "C / FC");
    // 事件记录发生时的选择：之后改选不影响已排队的消息。
    await clear(); await select(2); await berry(); await select(1);
    assert.equal((await tx(claimGoldenRoomEvent))?.challengeName, "FC");

    // 被软删除的选择视为没有选择。
    await clear(); await select(3); await pg.exec("UPDATE challenge SET deleted_at=now() WHERE id=3");
    await enter();
    assert.equal((await events()).length, 2);
    await pg.exec("UPDATE challenge SET deleted_at=null WHERE id=3");

    // 在线列表：明确选择优先于愿望单推测，标记为 selection。
    await pg.exec(`INSERT INTO tracker_presence(device_id,account_id,history_epoch,observation,connected)
      VALUES(1,1,'${epoch}','{"sid":"Test/SID","side":"Normal","room":"end","paused":false,"transitioning":false,"holdingGolden":true,"cctAvailable":true,"cctTrackingPaused":false}',true)`);
    const online = async () => (await readOnlinePlayers(tx))[0];
    await select(3);
    let player = await online();
    assert.equal(player.challengeName, "[No DTS] C"); assert.equal(player.source, "selection");
    await select(null);
    player = await online();
    assert.equal(player.source, "wishlist");
  } finally { await pg.close(); }
});
