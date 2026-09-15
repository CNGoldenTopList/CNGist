import { getConfig } from "../../config";
import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { db as database } from "../../db/client";
import { account, player, playerBindingCode, playerBindingThrottle, playerClaimRequest } from "../../db/schema/index";
import { lockPlayerNames, playerHasBilibiliUid, playerNameTaken } from "./player-names";
import { writeAudit, type Actor } from "../admin/audit";
import { extractBilibiliUid, type BilibiliLookup } from "../../integrations/bilibili";
import { playerBilibiliUids } from "../../../../shared/src/bilibili-uid";
import { fail, type ApiFailure } from "../../../../shared/src/api-errors";

type Result<T> = { ok: true; data: T } | ApiFailure;
type Binding = typeof playerBindingCode.$inferSelect;
export type BindingPayload = {
  id: number; code: string; bilibiliUid: string; bilibiliName: string;
  playerId: number | null; expiresAt: string; nextCheckAt: string;
};
export function normalizeBindingCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? code : null;
}
export function bindingArticleUrl(value = getConfig().bilibili.bindingArticleUrl): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && url.hostname === "www.bilibili.com" && !url.username && !url.password && !url.port
      && /^\/(read\/(cv\d+|mobile)|opus\/\d+)/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function createPlayerBindingService(db: typeof database, lookup: (uid: string) => Promise<BilibiliLookup>, now = () => new Date()) {
  async function payload(row: Binding): Promise<BindingPayload> {
    const throttles = await db.select().from(playerBindingThrottle).where(inArray(playerBindingThrottle.key, [`check:account:${row.accountId}`, `check:uid:${row.bilibiliUid}`]));
    const next = Math.max(row.createdAt.getTime() + 10_000, ...throttles.map((t) => t.attemptedAt.getTime() + 60_000));
    return { id: row.id, code: row.code, bilibiliUid: row.bilibiliUid, bilibiliName: row.bilibiliName, playerId: row.playerId, expiresAt: row.expiresAt.toISOString(), nextCheckAt: new Date(next).toISOString() };
  }
  async function current(accountId: number) {
    const [row] = await db.select().from(playerBindingCode).where(and(eq(playerBindingCode.accountId, accountId), isNull(playerBindingCode.closedAt), gt(playerBindingCode.expiresAt, now())));
    return row ? payload(row) : null;
  }
  async function begin(accountId: number, input: { uid?: unknown; playerId?: unknown }): Promise<Result<BindingPayload>> {
    const uid = extractBilibiliUid(typeof input.uid === "string" ? input.uid : "");
    if (!uid) return fail("claimUidInvalid");
    if (input.playerId !== undefined && (!Number.isSafeInteger(input.playerId) || Number(input.playerId) <= 0)) return fail("requestMalformed");
    const existing = await current(accountId);
    if (existing?.bilibiliUid === uid && existing.playerId === (input.playerId ?? null)) return { ok: true, data: existing };
    // 在网络请求前领取生成冷却，防止重复点击或并发放大上游请求。
    const allowed = await db.transaction(async (tx) => {
      await lockPlayerNames(tx);
      const [owner] = await tx.select().from(account).where(eq(account.id, accountId));
      if (!owner || owner.status !== "active") return false;
      const key = `create:${accountId}`;
      const [last] = await tx.select().from(playerBindingThrottle).where(eq(playerBindingThrottle.key, key));
      if (last && now().getTime() - last.attemptedAt.getTime() < 60_000) return false;
      await tx.insert(playerBindingThrottle).values({ key, attemptedAt: now() }).onConflictDoUpdate({ target: playerBindingThrottle.key, set: { attemptedAt: now() } });
      return true;
    });
    if (!allowed) return fail("bindingThrottled");
    const profile = await lookup(uid);
    if (!profile.ok) return profile;
    const result = await db.transaction(async (tx): Promise<Result<Binding>> => {
      await lockPlayerNames(tx);
      const [owner] = await tx.select().from(account).where(eq(account.id, accountId)).for("update");
      if (!owner || owner.status !== "active") return fail("accountDisabled");
      const targets = await tx.select().from(player).where(playerHasBilibiliUid(uid));
      if (targets.length > 1 || targets[0]?.deletedAt) return fail("bindingTargetChanged");
      const target = targets[0];
      if (input.playerId && target?.id !== input.playerId) return fail("bindingTargetChanged");
      if (target) {
        const [occupied] = await tx.select().from(account).where(eq(account.claimedPlayerId, target.id));
        if (occupied) return fail("claimTaken");
      }
      // 待验证码既不创建玩家，也不占用名称或 UID。
      await tx.update(playerBindingCode).set({ closedAt: now() }).where(and(eq(playerBindingCode.accountId, accountId), isNull(playerBindingCode.closedAt)));
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (;;) {
        const raw = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
        const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
        const [row] = await tx.insert(playerBindingCode).values({ accountId, playerId: target?.id ?? null, bilibiliUid: uid, bilibiliName: profile.name, code, createdAt: now(), expiresAt: new Date(now().getTime() + 7 * 86400_000) }).onConflictDoNothing({ target: playerBindingCode.code }).returning();
        if (row) return { ok: true, data: row };
      }
    });
    return result.ok ? { ok: true, data: await payload(result.data) } : result;
  }
  async function cancel(accountId: number) {
    await db.transaction(async (tx) => {
      await lockPlayerNames(tx);
      await tx.update(playerBindingCode).set({ closedAt: now() }).where(and(eq(playerBindingCode.accountId, accountId), isNull(playerBindingCode.closedAt)));
    });
  }
  async function preview(codeInput: unknown): Promise<Result<BindingPayload>> {
    const code = normalizeBindingCode(codeInput);
    if (!code) return fail("bindingInvalid");
    const [row] = await db.select().from(playerBindingCode).where(and(eq(playerBindingCode.code, code), isNull(playerBindingCode.closedAt), gt(playerBindingCode.expiresAt, now())));
    return row ? { ok: true, data: await payload(row) } : fail("bindingInvalid");
  }
  async function accept(id: number, method: "signature" | "admin", expected: { accountId?: number; uid?: string; name?: string }, actor?: Actor): Promise<Result<typeof account.$inferSelect>> {
    return db.transaction(async (tx) => {
      await lockPlayerNames(tx);
      if (method === "admin") {
        if (!actor) return fail("signInRequired");
        const [admin] = await tx.select().from(account).where(eq(account.id, actor.id)).for("share");
        if (!admin || admin.status !== "active" || !["admin", "super_admin"].includes(admin.role)) return fail("accountDisabled");
        actor = admin;
      }
      const [row] = await tx.select().from(playerBindingCode).where(eq(playerBindingCode.id, id)).for("update");
      if (!row || row.closedAt || row.expiresAt <= now()) return fail("bindingInvalid");
      if (method === "signature" ? row.accountId !== expected.accountId : row.bilibiliUid !== expected.uid || row.bilibiliName !== expected.name) return fail("bindingInvalid");
      const [owner] = await tx.select().from(account).where(eq(account.id, row.accountId)).for("update");
      if (!owner || owner.status !== "active") return fail("accountDisabled");
      const targets = await tx.select().from(player).where(playerHasBilibiliUid(row.bilibiliUid)).for("update");
      if (targets.length > 1 || targets[0]?.deletedAt) return fail("bindingTargetChanged");
      let target = targets[0];
      if (row.playerId && (target?.id !== row.playerId || !playerBilibiliUids(target).includes(row.bilibiliUid))) return fail("bindingTargetChanged");
      if (target) {
        const [occupied] = await tx.select().from(account).where(eq(account.claimedPlayerId, target.id));
        if (occupied) return fail("claimTaken");
      } else {
        // 旧申请只在成功接受时作废；它们不能挡住申请人自己的绑定。
        const [legacy] = await tx.select().from(playerClaimRequest).where(and(eq(playerClaimRequest.accountId, row.accountId), eq(playerClaimRequest.status, "pending")));
        if (await playerNameTaken(tx, row.bilibiliName, undefined, legacy?.id)) return fail("playerNameTaken");
      }
      // 所有失败校验先完成，以下写入必须整体提交。
      if (!target) {
        [target] = await tx.insert(player).values({ name: row.bilibiliName, bilibiliUid: row.bilibiliUid, bilibiliUids: [row.bilibiliUid], bilibiliUrl: `https://space.bilibili.com/${row.bilibiliUid}` }).returning();
      }
      const [updated] = await tx.update(account).set({ claimedPlayerId: target.id, claimedBilibiliName: target.name, bilibiliUid: row.bilibiliUid, updatedAt: now() }).where(eq(account.id, owner.id)).returning();
      await tx.update(playerBindingCode).set({ closedAt: now(), acceptedVia: method }).where(eq(playerBindingCode.id, id));
      await tx.update(playerClaimRequest).set({ status: "rejected", reviewedAt: now(), reviewNote: "已通过绑定码完成认领，旧申请作废。" }).where(and(eq(playerClaimRequest.accountId, owner.id), eq(playerClaimRequest.status, "pending")));
      await writeAudit(tx, actor ?? owner, "验证玩家认领", `${target.name}（UID ${row.bilibiliUid}） · ${method === "admin" ? "管理员核对专栏评论" : "B 站签名验证"} · 认领账户：${owner.displayName}（${owner.id}）`);
      return { ok: true, data: updated };
    });
  }
  async function verify(accountId: number) {
    const reservation = await db.transaction(async (tx): Promise<Result<Binding>> => {
      await lockPlayerNames(tx);
      const [row] = await tx.select().from(playerBindingCode).where(and(eq(playerBindingCode.accountId, accountId), isNull(playerBindingCode.closedAt), gt(playerBindingCode.expiresAt, now()))).for("update");
      if (!row) return fail("bindingInvalid");
      if (now().getTime() < row.createdAt.getTime() + 10_000) return fail("bindingWait");
      const keys = [`check:account:${accountId}`, `check:uid:${row.bilibiliUid}`];
      const last = await tx.select().from(playerBindingThrottle).where(inArray(playerBindingThrottle.key, keys));
      if (last.some((t) => now().getTime() - t.attemptedAt.getTime() < 60_000)) return fail("bindingThrottled");
      for (const key of keys) await tx.insert(playerBindingThrottle).values({ key, attemptedAt: now() }).onConflictDoUpdate({ target: playerBindingThrottle.key, set: { attemptedAt: now() } });
      return { ok: true, data: row };
    });
    if (!reservation.ok) return reservation;
    const row = reservation.data;
    // 网络 I/O 在事务外；返回后重新锁定并检查码，取消/换码/管理员接受均无法竞态复用。
    const profile = await lookup(row.bilibiliUid);
    if (!profile.ok) return profile;
    if (typeof profile.sign !== "string" || profile.sign.trim() !== row.code) return fail("bindingMismatch");
    return accept(row.id, "signature", { accountId });
  }
  return { current, begin, cancel, preview, accept, verify };
}
