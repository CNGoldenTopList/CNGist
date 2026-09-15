/** admin 表结构。 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { account } from "./auth";

export const adminTask = pgTable("admin_task", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  href: text("href"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: integer("completed_by").references(() => account.id),
  completedByLabel: text("completed_by_label"),
}, (table) => [
  index("admin_task_completed_created_idx").on(table.completedAt, table.createdAt),
]);

export const trashItem = pgTable("trash_item", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  kind: text("kind").notNull(),
  targetId: integer("target_id").notNull(),
  label: text("label").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("trash_item_target_key").on(table.kind, table.targetId),
  check("trash_item_kind_known", sql`${table.kind} IN ('record', 'campaign', 'map', 'challenge', 'player')`),
]);

export const trashVote = pgTable("trash_vote", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  trashItemId: integer("trash_item_id").notNull().references(() => trashItem.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("trash_vote_item_account_key").on(table.trashItemId, table.accountId),
]);

export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(),
  detail: text("detail").notNull().default(""),
  actor: text("actor").notNull().default("系统"),
  /** 从旧 AdminStore 导入时用于幂等去重；新审计可为空。 */
  sourceKey: text("source_key"),
}, (table) => [
  index("audit_log_at_idx").on(table.at),
  uniqueIndex("audit_log_source_key").on(table.sourceKey),
]);

export const migrationIdMap = pgTable("migration_id_map", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  entity: text("entity").notNull(),
  oldId: text("old_id").notNull(),
  newId: integer("new_id").notNull(),
}, t => [uniqueIndex("migration_id_map_old_key").on(t.entity, t.oldId), uniqueIndex("migration_id_map_new_key").on(t.entity, t.newId)]);
