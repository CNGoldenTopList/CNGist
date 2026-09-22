import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { db } from "../src/db/client";
import { createPlayerBindingService } from "../src/modules/players/player-binding-service";
import { updateOwnPlayerStatus } from "../src/modules/players/player-status";
import { createAdminSubmission, createPlayerSubmission, resubmitOwnSubmission } from "../src/modules/records/submission-service";

test("玩家绑定状态、自助权限与挑战写入限制（独立内存数据库）", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) {
      await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    }
    const memory = drizzle(pg, { schema });
    // 所有生产数据库入口都替换为独立内存库，绝不触碰运行配置中的数据库。
    for (const key of ["select", "insert", "update", "delete", "execute", "transaction"] as const) {
      mock.method(db, key, memory[key].bind(memory));
    }
    const [admin] = await memory.insert(schema.account).values({ displayName: "管理员", role: "admin" }).returning();
    const bindings = createPlayerBindingService(db, async uid => ({ ok: true, name: `玩家${uid}` }));
    for (const [index, initial] of [null, "unasked", "unreplied", "normal", "unwilling", "blocked"].entries()) {
      const uid = String(10000 + index);
      const [owner] = await memory.insert(schema.account).values({ displayName: `账户${uid}` }).returning();
      if (initial) await memory.insert(schema.player).values({ name: `玩家${uid}`, status: initial, bilibiliUid: uid, bilibiliUids: [uid] });
      const started = await bindings.begin(owner.id, { uid });
      assert.equal(started.ok, true);
      if (!started.ok) throw new Error(started.error);
      const accepted = await bindings.accept(started.data.id, index % 2 ? "admin" : "signature",
        index % 2 ? { uid, name: `玩家${uid}` } : { accountId: owner.id }, admin);
      assert.equal(accepted.ok, true);
      if (!accepted.ok) throw new Error(accepted.error);
      const [target] = await memory.select().from(schema.player).where(eq(schema.player.id, accepted.data.claimedPlayerId!));
      assert.equal(target.status, initial === "unwilling" || initial === "blocked" ? initial : "normal");
    }
    const [target] = await memory.insert(schema.player).values({ name: "状态测试", status: "normal" }).returning();
    const [owner] = await memory.insert(schema.account).values({ displayName: "本人", claimedPlayerId: target.id }).returning();
    const [outsider] = await memory.insert(schema.account).values({ displayName: "他人" }).returning();
    assert.equal((await updateOwnPlayerStatus(outsider.id, target.id, "unwilling")).ok, false);
    for (const status of ["blocked", "unasked", "unreplied", null]) assert.equal((await updateOwnPlayerStatus(owner.id, target.id, status)).ok, false);
    for (const status of ["unwilling", "normal"]) {
      assert.equal((await updateOwnPlayerStatus(owner.id, target.id, status)).ok, true);
      assert.equal((await memory.select().from(schema.player).where(eq(schema.player.id, target.id)))[0].status, status);
    }
    await memory.update(schema.account).set({ status: "disabled" }).where(eq(schema.account.id, owner.id));
    assert.equal((await updateOwnPlayerStatus(owner.id, target.id, "unwilling")).ok, false);
    await memory.update(schema.account).set({ status: "active" }).where(eq(schema.account.id, owner.id));
    const [pack] = await memory.insert(schema.campaign).values({ name: "Pack", shortName: "Pack" }).returning();
    const [map] = await memory.insert(schema.map).values({ name: "Map", campaignId: pack.id }).returning();
    const [challenge, standard] = await memory.insert(schema.challenge).values([
      { scope: "map", mapId: map.id, name: "C", tierCode: "t7" },
      { scope: "map", mapId: map.id, name: "FC", tierCode: "mid-std" },
    ]).returning();
    const input = { challengeId: challenge.id, achievedAt: "2026-09-22", videoUrl: "https://example.test/video" };
    const pending = await createPlayerSubmission(owner, target.id, input);
    assert.equal(pending.ok, true);
    if (!pending.ok) throw new Error(pending.error);
    await memory.update(schema.player).set({ status: "blocked" }).where(eq(schema.player.id, target.id));
    const before = await memory.select().from(schema.submission);
    const denied = [
      await updateOwnPlayerStatus(owner.id, target.id, "normal"),
      await updateOwnPlayerStatus(owner.id, target.id, "unwilling"),
      await createPlayerSubmission(owner, target.id, input),
      await createPlayerSubmission(owner, target.id, { ...input, challengeId: standard.id }),
      await createPlayerSubmission(owner, target.id, { ...input, kind: "challenge", proposedTarget: { campaignName: "Pack", mapName: "Map", challengeName: "New", gameBananaUrl: "https://gamebanana.com/mods/1234" } }),
      await resubmitOwnSubmission(owner, target.id, pending.data.id, input),
      ...await Promise.all((["pending", "accepted", "rejected", "hidden"] as const).map(status => createAdminSubmission(admin, { ...input, playerId: target.id, status }))),
    ];
    for (const result of denied) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 403);
    }
    assert.deepEqual(await memory.select().from(schema.submission), before);
    await memory.update(schema.player).set({ status: "normal" }).where(eq(schema.player.id, target.id));
    assert.equal((await resubmitOwnSubmission(owner, target.id, pending.data.id, input)).ok, true);
    assert.equal((await createAdminSubmission(admin, { ...input, playerId: target.id, status: "accepted" })).ok, true);
    await memory.update(schema.player).set({ deletedAt: new Date() }).where(eq(schema.player.id, target.id));
    assert.equal((await updateOwnPlayerStatus(owner.id, target.id, "unwilling")).ok, false);
  } finally {
    mock.restoreAll();
    await pg.close();
  }
});
