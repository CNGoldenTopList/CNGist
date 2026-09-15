/** tracker 表结构。 */
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { CctMetadata, CctRoom } from "../../modules/tracker/cct-state";
import { account } from "./auth";
import { map } from "./catalog";
import { player } from "./players";

export const trackerCctStorage = pgTable("tracker_cct_storage", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().unique().references(() => account.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  historyEpoch: uuid("history_epoch").notNull().defaultRandom(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackerCctScope = pgTable("tracker_cct_scope", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => trackerCctStorage.accountId, { onDelete: "cascade" }),
  // 设备身份只能由令牌验证结果提供。
  deviceId: integer("device_id").notNull().references(() => trackerDevice.id, { onDelete: "cascade" }),
  datasetId: uuid("dataset_id").notNull(),
  sid: text("sid").notNull(),
  side: text("side").notNull(),
  segmentKey: text("segment_key").notNull(),
  streamEpoch: uuid("stream_epoch").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  stateHash: text("state_hash").notNull(),
  lastMutationId: uuid("last_mutation_id").notNull(),
  lastMutationHash: text("last_mutation_hash").notNull(),
  metadata: jsonb("metadata").$type<CctMetadata>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("tracker_cct_scope_owner_key").on(table.accountId, table.deviceId, table.datasetId, table.sid, table.side, table.segmentKey),
  check("tracker_cct_scope_side", sql`${table.side} IN ('Normal', 'BSide', 'CSide')`),
  check("tracker_cct_scope_revision", sql`${table.revision} BETWEEN 0 AND 9007199254740991`),
  check("tracker_cct_scope_hash", sql`${table.stateHash} ~ '^[a-f0-9]{64}$' AND ${table.lastMutationHash} ~ '^[a-f0-9]{64}$'`),
]);

export const trackerCctRoom = pgTable("tracker_cct_room", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  scopeId: integer("scope_id").notNull().references(() => trackerCctScope.id, { onDelete: "cascade" }),
  roomKey: text("room_key").notNull(),
  data: jsonb("data").$type<CctRoom>().notNull(),
}, table => [
  uniqueIndex().on(table.scopeId, table.roomKey),
  check("tracker_cct_room_window", sql`coalesce(jsonb_typeof(${table.data}->'previousAttempts') = 'array' AND jsonb_array_length(${table.data}->'previousAttempts') <= 100, false)`),
  check("tracker_cct_room_key", sql`coalesce(${table.data}->>'roomKey' = ${table.roomKey}, false)`),
]);

export const trackerAreaStats = pgTable("tracker_area_stats", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => trackerCctStorage.accountId, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => trackerDevice.id, { onDelete: "cascade" }),
  datasetId: uuid("dataset_id").notNull(),
  sid: text("sid").notNull(),
  side: text("side").notNull(),
  completed: boolean("completed"),
  noGoldenBestDeaths: integer("no_golden_best_deaths"),
  totalDeaths: integer("total_deaths"),
  source: text("source").notNull().default("observed_no_native_golden_clear_v1"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("tracker_area_stats_owner_key").on(table.accountId, table.deviceId, table.datasetId, table.sid, table.side),
  check("tracker_area_stats_deaths", sql`${table.noGoldenBestDeaths} >= 0`),
  check("tracker_area_stats_total_deaths", sql`${table.totalDeaths} >= 0`),
  check("tracker_area_stats_known_value", sql`${table.noGoldenBestDeaths} IS NOT NULL OR ${table.totalDeaths} IS NOT NULL OR ${table.completed} IS NOT NULL`),
  check("tracker_area_stats_side", sql`${table.side} IN ('Normal', 'BSide', 'CSide')`),
  check("tracker_area_stats_source", sql`${table.source} = 'observed_no_native_golden_clear_v1'`),
]);

export const trackerDeviceAuthorization = pgTable("tracker_device_authorization", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  /** 只存授权码的 SHA-256，与 session/email_token 同一套做法。 */
  codeHash: text("code_hash").notNull(),
  /** PKCE：base64url 的 SHA-256(verifier)，兑换时比对。只支持 S256。 */
  codeChallenge: text("code_challenge").notNull(),
  /** 已校验过的回环地址；手输兑换时为空。 */
  redirectUri: text("redirect_uri"),
  deviceName: text("device_name").notNull(),
  clientName: text("client_name").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** 一次性：兑换成功即写入，之后同一个码再来一律拒绝。 */
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tracker_device_authorization_code_key").on(table.codeHash),
  index("tracker_device_authorization_expiry_idx").on(table.expiresAt),
]);

export const trackerDevice = pgTable("tracker_device", {
  externalId: uuid("external_id").notNull().defaultRandom().unique(),
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("tracker_device_token_key").on(table.tokenHash),
  index("tracker_device_account_idx").on(table.accountId, table.createdAt),
]);

export type TrackerDevice = typeof trackerDevice.$inferSelect;

export const trackerMapBinding = pgTable("tracker_map_binding", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 提交人。通过后映射与提交人无关，删号也不撤销已生效的映射。 */
  accountId: integer("account_id").references(() => account.id, { onDelete: "set null" }),
  sid: text("sid").notNull(),
  side: text("side").notNull(),
  mapId: integer("map_id").notNull().references(() => map.id),
  /** 提交时 CCT 路线里的名称，只作审核参考，不写回目录。 */
  campaignName: text("campaign_name"),
  chapterName: text("chapter_name"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => account.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // 一个 SID/面全站只有一条生效映射，冲突在数据库这一层就挡住。
  uniqueIndex("tracker_map_binding_approved_key").on(table.sid, table.side).where(sql`status = 'approved'`),
  // 同一个人对同一 SID/面只留一条待审，避免刷提交占审核队列。
  uniqueIndex("tracker_map_binding_pending_key").on(table.accountId, table.sid, table.side).where(sql`status = 'pending'`),
  index("tracker_map_binding_status_idx").on(table.status, table.createdAt),
  check("tracker_map_binding_side", sql`${table.side} IN ('Normal', 'BSide', 'CSide')`),
  check("tracker_map_binding_status", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
]);

export type TrackerMapBinding = typeof trackerMapBinding.$inferSelect;

export const trackerPresence = pgTable("tracker_presence", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  deviceId: integer("device_id").notNull().unique().references(() => trackerDevice.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().defaultRandom(),
  historyEpoch: uuid("history_epoch").notNull(),
  sequence: bigint("sequence", { mode: "number" }).notNull().default(0),
  observation: jsonb("observation"),
  batchHash: text("batch_hash"),
  connected: boolean("connected").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("tracker_presence_account_idx").on(table.accountId)]);

export const trackerMapVisit = pgTable("tracker_map_visit", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => trackerDevice.id, { onDelete: "cascade" }),
  sid: text("sid").notNull(),
  side: text("side").notNull(),
  historyEpoch: uuid("history_epoch").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex().on(table.accountId, table.deviceId, table.sid, table.side),
  check("tracker_map_visit_side", sql`${table.side} IN ('Normal', 'BSide', 'CSide')`),
]);

export const goldenRoomRule = pgTable("golden_room_rule", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  mapId: integer("map_id").notNull().references(() => map.id, { onDelete: "cascade" }),
  sid: text("sid").notNull(),
  side: text("side").notNull(),
  roomKey: text("room_key").notNull(),
  roomName: text("room_name").notNull(),
  extraText: text("extra_text").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("golden_room_rule_target_key").on(t.mapId, t.sid, t.side, t.roomKey),
  check("golden_room_rule_side", sql`${t.side} IN ('Normal', 'BSide', 'CSide')`)]);

export const goldenRoomState = pgTable("golden_room_state", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ruleId: integer("rule_id").notNull().references(() => goldenRoomRule.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  inside: boolean("inside").notNull(),
  historyEpoch: uuid("history_epoch").notNull(),
}, t => [uniqueIndex().on(t.ruleId, t.accountId)]);

export const goldenRoomEvent = pgTable("golden_room_event", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ruleId: integer("rule_id").notNull().references(() => goldenRoomRule.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => trackerDevice.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  historyEpoch: uuid("history_epoch").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("golden_room_event_pending_idx").on(t.status, t.createdAt)]);
