import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { readPingPlayers } from "../src/modules/tracker/ping-players";
import type { CctSql } from "../src/modules/tracker/cct-repository";

test("Ping 玩家分页只列已设置玩家，按激活数排序，保留禁用玩家并先搜索后分页", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(file,folder),"utf8"));
    await pg.exec(`
      INSERT INTO player(id,name) SELECT n,'Player '||lpad(n::text,2,'0') FROM generate_series(1,24) n;
      INSERT INTO account(id,display_name,claimed_player_id) SELECT id,name,id FROM player;
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO map(id,name,campaign_id) VALUES(1,'Map',1);
      INSERT INTO challenge(id,scope,map_id,name,tier_code) VALUES(1,'map',1,'C','t7'),(2,'map',1,'FC','h3');
      INSERT INTO wishlist_entry(account_id,challenge_id) SELECT n,1 FROM generate_series(1,23) n;
      INSERT INTO wishlist_entry(account_id,challenge_id) VALUES(22,2);
      INSERT INTO golden_room_rule(wishlist_entry_id,map_id,sid,side,room_key,room_name)
        SELECT id,1,'Test','Normal','end','End' FROM wishlist_entry;
      INSERT INTO tracker_map_binding(map_id,sid,side,status) VALUES(1,'Test','Normal','approved');
      UPDATE player SET ping_disabled=true WHERE id=1;
    `);
    const read = (q="",page=1) => readPingPlayers(pg as unknown as CctSql,q,page);
    const first = await read();
    assert.equal(first.total,23); assert.equal(first.players.length,20);
    assert.equal(first.players[0].id,22); assert.equal(first.players[0].points,2);
    const second = await read("",2);
    assert.equal(second.players.length,3);
    assert.equal(new Set([...first.players,...second.players].map(p=>p.id)).size,23);
    assert.ok(![...first.players,...second.players].some(p=>p.id===24));
    assert.equal(second.players.at(-1)?.id,1);
    assert.equal(second.players.at(-1)?.points,0);
    assert.equal(second.players.at(-1)?.configuredPoints,1);
    const filtered = await read("player 22");
    assert.equal(filtered.total,1);assert.equal(filtered.players[0].id,22);
    assert.equal((await read("22")).players[0].id,22);
    assert.equal((await read("missing")).total,0);
    assert.deepEqual((await read("",3)).players,[]);
    await pg.exec("UPDATE challenge SET tier_code='low-std' WHERE id=2");
    assert.equal((await read("22")).players[0].points,1);
    await pg.exec("UPDATE tracker_map_binding SET status='pending'");
    assert.equal((await read("22")).players[0].points,0);
  } finally {await pg.close();}
});
