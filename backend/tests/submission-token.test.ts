import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { db, pool } from "../src/db/client";
import { buildApp } from "../src/app";

test("补录 token：最小权限、来源隔离、真实写入、撤销/到期/降权（独立内存库）", async () => {
  const pg = new PGlite();
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) {
      await pg.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
    }
    const memory = drizzle(pg, { schema });
    for (const key of ["select", "insert", "update", "delete", "execute", "transaction"] as const) mock.method(db, key, memory[key].bind(memory));
    const [admin, otherAdmin, playerAccount] = await memory.insert(schema.account).values([
      { displayName: "补录管理员", role: "admin" }, { displayName: "其他管理员", role: "super_admin" }, { displayName: "玩家", role: "player" },
    ]).returning();
    const cookie = async (id: number) => {
      const token = `test-session-${id}`;
      await memory.insert(schema.session).values({ accountId: id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400000) });
      return `cngist_session=${token}`;
    };
    const adminCookie = await cookie(admin.id), otherCookie = await cookie(otherAdmin.id), playerCookie = await cookie(playerAccount.id);
    const [target] = await memory.insert(schema.player).values({ name: "玩家", status: "normal" }).returning();
    const [pack] = await memory.insert(schema.campaign).values({ name: "Pack", shortName: "Pack" }).returning();
    const [map] = await memory.insert(schema.map).values({ name: "Map", campaignId: pack.id }).returning();
    const [goal, standard] = await memory.insert(schema.challenge).values([
      { scope: "map", mapId: map.id, name: "C", tierCode: "t7" }, { scope: "map", mapId: map.id, name: "Std", tierCode: "mid-std" },
    ]).returning();
    app = await buildApp();
    const management = "/api/admin/submission-token";
    for (const headers of [{}, { cookie: playerCookie }]) assert.equal((await app.inject({ method: "POST", url: management, headers })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: management, headers: { cookie: adminCookie, origin: "https://evil.test" } })).statusCode, 403);
    const issued = await app.inject({ method: "POST", url: management, headers: { cookie: adminCookie } });
    assert.equal(issued.statusCode, 201, issued.body);
    const { id, token } = issued.json();
    assert.match(token, /^cngclip_[A-Za-z0-9_-]{43}$/);
    const [saved] = await memory.select().from(schema.submissionToken);
    assert.equal(saved.tokenHash, createHash("sha256").update(token).digest("hex")); assert.notEqual(saved.tokenHash, token);
    const headers = { authorization: `Bearer ${token}`, origin: "https://www.bilibili.com", "sec-fetch-site": "cross-site" };
    const input = { playerId: target.id, challengeId: goal.id, videoUrl: "https://www.bilibili.com/video/BV1xx411c7mD", achievedAt: "2026-09-26" };
    const post = (payload: object, h = headers) => app!.inject({ method: "POST", url: "/api/clip/submissions", headers: h, payload });
    const query = () => app!.inject({ method: "GET", url: `/api/clip/submissions?playerId=${target.id}`, headers });
    const verify = () => app!.inject({ method: "GET", url: "/api/clip/authorization", headers });
    assert.equal((await verify()).statusCode, 200);
    assert.deepEqual((await verify()).json(), { ok: true });
    assert.equal((await app.inject({ method: "GET", url: "/api/clip/authorization", headers: { cookie: adminCookie } })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: `/api/clip/submissions?playerId=${target.id}`, headers: { cookie: adminCookie } })).statusCode, 401);
    for (const value of ['', '-1', 'abc', '1.1', '2147483648']) assert.equal((await app.inject({ method: "GET", url: `/api/clip/submissions?playerId=${value}`, headers })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/clip/submissions", headers: { cookie: adminCookie }, payload: input })).statusCode, 401);
    assert.equal((await post(input, { ...headers, authorization: "Bearer invalid" })).statusCode, 401);
    for (const payload of [[], { ...input, status: "accepted" }, { ...input, verified: true }, { ...input, accountId: admin.id }, { ...input, kind: "challenge" }, { ...input, addFc: true }, { ...input, challengeId: "1" }, { ...input, videoUrl: {} }]) assert.equal((await post(payload)).statusCode, 400);
    const created = await post(input); assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().record.status, "pending");
    assert.deepEqual(Object.keys(created.json().record).sort(), ["achievedAt", "challengeId", "id", "playerId", "status", "videoUrl"]);
    const [record] = await memory.select().from(schema.submission); assert.equal(record.submittedBy, admin.id); assert.equal(record.verified, false);
    assert.equal((await post({ ...input, challengeId: standard.id })).json().record.status, "accepted");
    await memory.update(schema.player).set({ status: "unwilling" }).where(eq(schema.player.id, target.id));
    assert.equal((await post(input)).json().record.status, "rejected");
    await memory.update(schema.player).set({ status: "blocked" }).where(eq(schema.player.id, target.id));
    assert.equal((await post(input)).statusCode, 403);
    await memory.update(schema.player).set({ status: "normal" }).where(eq(schema.player.id, target.id));
    // 和原管理员队列逐条对照：包含 pending/rejected/hidden 及站内 accepted，排除回收和其他玩家。
    const [anotherPlayer] = await memory.insert(schema.player).values({ name: "其他玩家" }).returning();
    const extras = await memory.insert(schema.submission).values([
      { playerId: target.id, challengeId: goal.id, status: "hidden", videoUrl: "https://example.test/hidden", verifierNote: "不应泄露的管理备注" },
      { playerId: target.id, challengeId: goal.id, status: "pending", deletedAt: new Date(), videoUrl: "https://example.test/deleted" },
      { playerId: target.id, challengeId: goal.id, status: "accepted", videoUrl: "https://example.test/imported" },
      { playerId: anotherPlayer.id, challengeId: goal.id, status: "pending", videoUrl: "https://example.test/other" },
    ]).returning();
    const original = await app.inject({ method: "GET", url: "/api/admin/submissions", headers: { cookie: adminCookie } });
    assert.equal(original.statusCode, 200, original.body);
    const expected = original.json().data.filter((r: { playerId: number }) => r.playerId === target.id)
      .map(({ id, playerId, challengeId, videoUrl, achievedAt, status }: Record<string, unknown>) => ({ id, playerId, challengeId, videoUrl, achievedAt, status }));
    const checked = await query(); assert.equal(checked.statusCode, 200, checked.body); assert.deepEqual(checked.json().data, expected);
    assert.deepEqual(new Set(checked.json().data.map((r: { status: string }) => r.status)), new Set(["pending", "accepted", "rejected", "hidden"]));
    assert.equal(checked.body.includes("不应泄露"), false);
    await memory.delete(schema.submission).where(eq(schema.submission.id, extras[0].id));
    assert.equal((await query()).json().data.some((r: { id: number }) => r.id === extras[0].id), false);
    // Token 不被现有管理员 API 当作登录会话，跨站豁免也仅限新端点。
    for (const url of [management, "/api/admin/submissions"]) assert.equal((await app.inject({ method: "GET", url, headers })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/submissions", headers: { authorization: headers.authorization }, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...headers, cookie: adminCookie } })).statusCode, 403);
    const listing = await app.inject({ method: "GET", url: management, headers: { cookie: adminCookie } });
    assert.equal(listing.statusCode, 200); assert.equal(listing.body.includes(token), false); assert.equal(listing.body.includes(saved.tokenHash), false);
    await memory.update(schema.account).set({ role: "player" }).where(eq(schema.account.id, admin.id)); assert.equal((await post(input)).statusCode, 401); assert.equal((await query()).statusCode, 401); assert.equal((await verify()).statusCode, 401);
    await memory.update(schema.account).set({ role: "admin", status: "disabled" }).where(eq(schema.account.id, admin.id)); assert.equal((await post(input)).statusCode, 401);
    await memory.update(schema.account).set({ status: "active" }).where(eq(schema.account.id, admin.id));
    await memory.update(schema.submissionToken).set({ expiresAt: new Date(0) }).where(eq(schema.submissionToken.id, id)); assert.equal((await post(input)).statusCode, 401); assert.equal((await query()).statusCode, 401); assert.equal((await verify()).statusCode, 401);
    await memory.update(schema.submissionToken).set({ expiresAt: new Date(Date.now() + 86400000) }).where(eq(schema.submissionToken.id, id));
    assert.equal((await app.inject({ method: "DELETE", url: management, headers: { cookie: otherCookie }, payload: { id } })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: management, headers: { cookie: adminCookie }, payload: { id } })).statusCode, 200);
    assert.equal((await post(input)).statusCode, 401);
    assert.equal((await query()).statusCode, 401);
    assert.equal((await verify()).statusCode, 401);
    const afterRevoke = await app.inject({ method: "GET", url: management, headers: { cookie: adminCookie } });
    assert.deepEqual(afterRevoke.json().tokens, []);
    assert.equal((await memory.select().from(schema.submission)).length, 6);
  } finally { await app?.close(); mock.restoreAll(); await pg.close(); await pool.end(); }
});
