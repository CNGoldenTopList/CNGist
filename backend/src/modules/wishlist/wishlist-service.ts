import { entityId } from "../../../../shared/src/entity-id";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { account, challenge, wishlistEntry } from "../../db/schema/index";
import type { WishlistEntry, WishlistStatus } from "../../../../shared/src/admin";
import { fail, type ApiErrorCode, type ApiFailure } from "../../../../shared/src/api-errors";

type Result<T> = { ok: true; data: T } | (ApiFailure & { status: number }) | { ok: false; error: string; code?: undefined; status: number };
const STATUSES = new Set<WishlistStatus>(["active", "soon", "later", "archive"]);
function failure(error: string, status = 400): Result<never> { return { ok: false, error, status }; }
/** 带错误码的失败：界面会按当前语言翻译。 */
function failCode(code: ApiErrorCode, status = 400): Result<never> { return { ...fail(code), status }; }
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function optional(value: unknown, max: number) {
  const result = clean(value, max);
  return result || null;
}

function durationOf(row: typeof wishlistEntry.$inferSelect) {
  return row.practiceDuration ?? undefined;
}

function toEntry(row: typeof wishlistEntry.$inferSelect, playerId: number | null): WishlistEntry {
  return {
    id: row.id,
    playerId,
    challengeId: row.challengeId,
    status: STATUSES.has(row.status as WishlistStatus) ? row.status as WishlistStatus : "later",
    progress: row.progress,
    bestDeaths: row.bestDeaths ?? undefined,
    comment: row.comment ?? undefined,
    practiceDuration: durationOf(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function claimedPlayerId(accountId: number) {
  const rows = await db.select({ claimedPlayerId: account.claimedPlayerId }).from(account).where(eq(account.id, accountId)).limit(1);
  return rows[0]?.claimedPlayerId ?? null;
}

export async function listWishlistForAccount(accountId: number): Promise<WishlistEntry[]> {
  const [playerId, rows] = await Promise.all([
    claimedPlayerId(accountId),
    db.select().from(wishlistEntry).where(eq(wishlistEntry.accountId, accountId)).orderBy(asc(wishlistEntry.createdAt)),
  ]);
  return rows.map((row) => toEntry(row, playerId));
}

export async function listWishlistForPlayer(playerId: number): Promise<WishlistEntry[]> {
  const owners = await db.select({ id: account.id }).from(account).where(eq(account.claimedPlayerId, playerId)).limit(1);
  if (!owners[0]) return [];
  const rows = await db.select().from(wishlistEntry).where(eq(wishlistEntry.accountId, owners[0].id)).orderBy(asc(wishlistEntry.createdAt));
  return rows.map((row) => toEntry(row, playerId));
}

export async function addWishlistEntry(accountId: number, challengeIdInput: unknown): Promise<Result<WishlistEntry>> {
  const challengeId = entityId(challengeIdInput);
  if (!challengeId) return failCode("wishlistChallengeRequired");
  const targets = await db.select({ id: challenge.id }).from(challenge)
    .where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt))).limit(1);
  if (!targets[0]) return failCode("challengeMissing", 404);
  const playerId = await claimedPlayerId(accountId);
  const existing = await db.select().from(wishlistEntry)
    .where(and(eq(wishlistEntry.accountId, accountId), eq(wishlistEntry.challengeId, challengeId))).limit(1);
  if (existing[0]) return { ok: true, data: toEntry(existing[0], playerId) };
  const inserted = await db.insert(wishlistEntry).values({
    accountId, challengeId, status: "later", progress: 0,
  }).returning();
  return { ok: true, data: toEntry(inserted[0]!, playerId) };
}

export async function updateWishlistEntry(
  accountId: number,
  id: number,
  patch: Partial<Pick<WishlistEntry, "status" | "progress" | "comment" | "practiceDuration">> & { bestDeaths?: number | null },
): Promise<Result<WishlistEntry>> {
  const rows = await db.select().from(wishlistEntry).where(and(eq(wishlistEntry.id, id), eq(wishlistEntry.accountId, accountId))).limit(1);
  if (!rows[0]) return failCode("wishMissing", 404);
  const values: Partial<typeof wishlistEntry.$inferInsert> = { updatedAt: new Date() };
  if (patch.status !== undefined) {
    if (!STATUSES.has(patch.status)) return failCode("wishStatusInvalid");
    values.status = patch.status;
  }
  if (patch.progress !== undefined) {
    if (!Number.isFinite(patch.progress) || patch.progress < 0 || patch.progress > 100) return failCode("wishProgressRange");
    values.progress = Math.round(patch.progress);
  }
  if (patch.bestDeaths !== undefined) {
    if (patch.bestDeaths === null || Number.isNaN(Number(patch.bestDeaths))) values.bestDeaths = null;
    else {
      const deaths = Number(patch.bestDeaths);
      if (!Number.isFinite(deaths) || deaths < 0) return failCode("wishDeathsInvalid");
      values.bestDeaths = Math.round(deaths);
    }
  }
  if (patch.comment !== undefined) values.comment = optional(patch.comment, 4_000);
  if (patch.practiceDuration !== undefined) values.practiceDuration = optional(patch.practiceDuration, 32);
  await db.update(wishlistEntry).set(values).where(eq(wishlistEntry.id, id));
  const refreshed = await db.select().from(wishlistEntry).where(eq(wishlistEntry.id, id)).limit(1);
  const playerId = await claimedPlayerId(accountId);
  return { ok: true, data: toEntry(refreshed[0]!, playerId) };
}

export async function removeWishlistEntry(accountId: number, id: number): Promise<Result<{ id: number }>> {
  const rows = await db.select({ id: wishlistEntry.id }).from(wishlistEntry)
    .where(and(eq(wishlistEntry.id, id), eq(wishlistEntry.accountId, accountId))).limit(1);
  if (!rows[0]) return failCode("wishMissing", 404);
  await db.delete(wishlistEntry).where(eq(wishlistEntry.id, id));
  return { ok: true, data: { id } };
}

export async function removeWishlistByChallenge(accountId: number, challengeIdInput: unknown): Promise<Result<{ removed: boolean }>> {
  const challengeId = entityId(challengeIdInput);
  if (!challengeId) return failCode("wishlistChallengeRequired");
  const deleted = await db.delete(wishlistEntry)
    .where(and(eq(wishlistEntry.accountId, accountId), eq(wishlistEntry.challengeId, challengeId)))
    .returning({ id: wishlistEntry.id });
  return { ok: true, data: { removed: deleted.length > 0 } };
}
