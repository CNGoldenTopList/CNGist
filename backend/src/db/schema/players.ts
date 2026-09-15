/** players 表结构。 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { imageAsset } from "./assets";
import { account } from "./auth";

export const player = pgTable("player", {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  bio: text("bio"),
  bilibiliUid: text("bilibili_uid"),
  bilibiliUrl: text("bilibili_url"),
  bilibiliUids: text("bilibili_uids").array().notNull().default(sql`ARRAY[]::text[]`),
  aliases: text("aliases").array(),
  status: text("status").notNull().default("unasked"),
});

export const playerAvatarCache = pgTable("player_avatar_cache", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  playerId: integer("player_id").notNull().unique().references(() => player.id, { onDelete: "cascade" }),
  bilibiliUid: text("bilibili_uid").notNull(),
  objectKey: text("object_key").references(() => imageAsset.objectKey),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
});

export const playerBindingCode = pgTable("player_binding_code", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => player.id, { onDelete: "cascade" }),
  bilibiliUid: text("bilibili_uid").notNull(),
  bilibiliName: text("bilibili_name").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  acceptedVia: text("accepted_via"),
}, (table) => [
  uniqueIndex("player_binding_code_code_key").on(table.code),
  uniqueIndex("player_binding_code_active_account_key").on(table.accountId).where(sql`closed_at IS NULL`),
  check("player_binding_code_format", sql`${table.code} ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'`),
  check("player_binding_code_method", sql`${table.acceptedVia} IS NULL OR (${table.acceptedVia} IN ('signature', 'admin') AND ${table.closedAt} IS NOT NULL)`),
]);

export const playerBindingThrottle = pgTable("player_binding_throttle", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  key: text("key").notNull().unique(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
});

export const playerClaimRequest = pgTable("player_claim_request", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  bilibiliUid: text("bilibili_uid").notNull(),
  bilibiliName: text("bilibili_name").notNull(),
  /** 'fetched'：服务端抓到的昵称；'manual'：抓取失败后用户自己填的，审核时要多留意。 */
  nameSource: text("name_source").notNull().default("fetched"),
  status: text("status").notNull().default("pending"),
  /** 批准后落地的 player 行；UID 已入库时直接复用已有玩家，不重复建档。 */
  resultPlayerId: integer("result_player_id").references(() => player.id),
  reviewedBy: integer("reviewed_by").references(() => account.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("player_claim_request_status_idx").on(table.status, table.createdAt),
  // 同一账户同一时间只留一条待审申请，避免刷申请占位。
  uniqueIndex("player_claim_request_pending_account_key").on(table.accountId).where(sql`status = 'pending'`),
  check("player_claim_request_status_known", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  check("player_claim_request_source_known", sql`${table.nameSource} IN ('fetched', 'manual')`),
]);

export type PlayerClaimRequest = typeof playerClaimRequest.$inferSelect;
