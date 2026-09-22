import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { readWishlistPing, saveWishlistPing } from "../src/modules/tracker/wishlist-ping";
import { captureGoldenRoomEntry, claimGoldenRoomEvent } from "../src/modules/tracker/golden-room-alerts";
import type { CctSql } from "../src/modules/tracker/cct-repository";
import type { LiveObservation } from "../src/modules/tracker/presence";

test("Ping 点迁移、本人授权、Tier/配对校验、带金去重与发送前撤权", async () => {
  const pg = new PGlite();
  const sql = pg as unknown as CctSql;
  const epoch = "22222222-2222-4222-8222-222222222222";
  const principal = {accountId: 1, deviceId: 1, historyEpoch: epoch};
  const observation: LiveObservation = {sid: "Test/SID", side: "Normal", room: "end", holdingGolden: true,
    paused: false, transitioning: false, cctAvailable: true, cctTrackingPaused: false};
  const point = {sid: "Test/SID", side: "Normal", roomKey: "end"};
  const save = (accountId = 1, wishId = 1, value: unknown = point) => pg.transaction(tx => saveWishlistPing(tx as unknown as CctSql, accountId, {wishId, point: value}));
  const capture = (o: LiveObservation | null = observation, p = principal) => pg.transaction(tx => captureGoldenRoomEntry(tx as unknown as CctSql, p, o));
  const claim = () => pg.transaction(tx => claimGoldenRoomEvent(tx as unknown as CctSql));
  const events = async () => Number((await pg.query<{n:number}>("SELECT count(*)::int AS n FROM golden_room_event")).rows[0].n);
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(file,folder), "utf8"));
    await pg.exec(`
      INSERT INTO player(id,name) VALUES(1,'One'),(2,'Two');
      INSERT INTO account(id,display_name,claimed_player_id) VALUES(1,'One',1),(2,'Two',2),(3,'Unclaimed',null);
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO map(id,name,campaign_id) VALUES(1,'Map',1);
      INSERT INTO challenge(id,scope,map_id,name,tier_code) VALUES(1,'map',1,'C','t7'),(2,'map',1,'FC','h3'),(3,'map',1,'Std','low-std'),(4,'map',1,'Unknown','undetermined');
      INSERT INTO wishlist_entry(id,account_id,challenge_id) VALUES(1,1,1),(2,2,1),(3,1,3),(4,1,4),(5,1,2),(6,3,1);
      INSERT INTO tracker_device(id,account_id,name,token_hash) VALUES(1,1,'Device','hash'),(2,2,'Other','other');
      INSERT INTO tracker_cct_storage(account_id,enabled,history_epoch) VALUES(1,true,'${epoch}'),(2,true,'${epoch}');
      INSERT INTO tracker_map_binding(sid,side,map_id,status) VALUES('Test/SID','Normal',1,'approved');
      INSERT INTO tracker_cct_scope(account_id,device_id,dataset_id,sid,side,segment_key,stream_epoch,revision,state_hash,last_mutation_id,last_mutation_hash,metadata)
      VALUES(1,1,'33333333-3333-4333-8333-333333333333','Test/SID','Normal','full','44444444-4444-4444-8444-444444444444',1,repeat('a',64),'55555555-5555-4555-8555-555555555555',repeat('b',64),
        '{"cctVersion":"2.10.2","adapterVersion":"test","cctSessionKey":"s1","settings":{"selectedAttemptCount":20,"trackNegativeStreaks":true},"chapter":{"goldenCollectedCount":0,"goldenCollectedCountSession":0},"route":{"ignoredRooms":[],"checkpoints":[{"checkpointKey":"cp"}],"nodes":[{"roomKey":"start","checkpointKey":"cp","groupedRooms":[],"isNonGameplayRoom":false},{"roomKey":"end","checkpointKey":"cp","isNonGameplayRoom":false,"customRoomName":"Final room","groupedRooms":["end-alt"]}]}}');
      INSERT INTO golden_room_rule(map_id,sid,side,room_key,room_name) VALUES(1,'Test/SID','Normal','end','Legacy');
    `);
    assert.equal((await readWishlistPing(sql,1,1)).eligible, true);
    await assert.rejects(save(2,1), /invalid/);
    await assert.rejects(save(1,3), /ineligible/);
    await assert.rejects(save(1,4), /ineligible/);
    await assert.rejects(save(3,6), /claim/);
    await assert.rejects(save(1,1,{...point,side:'BSide'}), /invalid/);
    await save(); await save(2,2); await save(1,5);
    await save(); // unchanged save is idempotent
    assert.equal((await pg.query("SELECT * FROM golden_room_rule WHERE wishlist_entry_id IS NOT NULL")).rows.length,3);
    await capture({...observation, holdingGolden:false}); assert.equal(await events(),0);
    await capture(); await capture(); await capture(null); await capture();
    assert.equal(await events(),2); // two challenges belonging to this player, no legacy/other-player event
    const first = await claim(); assert.equal(first?.playerName,'One'); assert.equal(first?.roomName,'Final room');
    assert.equal(first?.position,2); assert.equal(first?.routeLength,2);
    await pg.exec("UPDATE player SET ping_disabled=true WHERE id=1");
    assert.equal(await claim(),null);
    await assert.rejects(save(),/disabled/);
    await save(1,5,null); // removal allowed while disabled
    await pg.exec("UPDATE player SET ping_disabled=false WHERE id=1; DELETE FROM golden_room_event;");
    await capture(); assert.equal(await events(),0); // reconnect/disable does not reset a stay
    await capture({...observation,room:'start'}); await capture(); assert.equal(await events(),1);
    await pg.exec("UPDATE challenge SET tier_code='low-std' WHERE id=1"); assert.equal(await claim(),null);
    await pg.exec("UPDATE challenge SET tier_code='t7' WHERE id=1; UPDATE map SET deleted_at=now() WHERE id=1"); assert.equal(await claim(),null);
    await pg.exec("UPDATE map SET deleted_at=null WHERE id=1; UPDATE tracker_map_binding SET status='pending'"); assert.equal(await claim(),null);
    await pg.exec("UPDATE tracker_map_binding SET status='approved'; UPDATE tracker_device SET revoked_at=now() WHERE id=1"); assert.equal(await claim(),null);
    await pg.exec("UPDATE tracker_device SET revoked_at=null WHERE id=1; UPDATE tracker_cct_storage SET enabled=false WHERE account_id=1"); assert.equal(await claim(),null);
    await pg.exec("UPDATE tracker_cct_storage SET enabled=true WHERE account_id=1; UPDATE golden_room_event SET created_at=now()-interval '2 minutes'"); assert.equal(await claim(),null);
    await save(1,1,{...point,roomKey:'start'}); assert.equal(await events(),0);
    await capture({...observation,room:'start'}); assert.equal(await events(),1);
    await pg.exec("UPDATE tracker_cct_scope SET metadata=jsonb_set(metadata,'{route}','null'::jsonb)");
    const withoutRoute = await claim();
    assert.equal(withoutRoute?.position,null); assert.equal(withoutRoute?.routeLength,null);
    await pg.exec("DELETE FROM wishlist_entry WHERE id=1"); assert.equal(await events(),0);
    assert.equal((await pg.query("SELECT * FROM golden_room_state")).rows.length,0);
    assert.equal((await pg.query<{ping_disabled:boolean}>("SELECT ping_disabled FROM player WHERE id=2")).rows[0].ping_disabled,false);
  } finally { await pg.close(); }
});
