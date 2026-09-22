/** records 表结构。 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { challenge, tier } from "./catalog";
import { player } from "./players";
import { account } from "./auth";

export const submission = pgTable("submission", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 新地图/挑战提案在审核归档前还没有 challenge；此时必须由 proposed_target 描述目标。 */
  challengeId: integer("challenge_id").references(() => challenge.id),
  playerId: integer("player_id").notNull().references(() => player.id),
  /** 谁提交的。导入的历史记录为空。 */
  submittedBy: integer("submitted_by").references(() => account.id),
  status: text("status").notNull().default("pending"),
  /** 正式 Tier 记录的人工通过标记；降到 Standard 时保留。 */
  verified: boolean("verified").notNull().default(false),
  /** 最近一次进入 accepted 的时间；与人工审核、玩家达成日期分开。由数据库触发器维护。 */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** 导入数据里有 196 条为空，不能造假日期，只能可空。 */
  achievedAt: date("achieved_at"),
  videoUrl: text("video_url").notNull().default(""),
  rawVideoUrl: text("raw_video_url"),
  playerNote: text("player_note"),
  verifierNote: text("verifier_note"),
  reviewedBy: integer("reviewed_by").references(() => account.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  /** 「审核中」认领：只是给其他管理员看的占位提示，避免同一个视频被反复看。 */
  reviewingBy: integer("reviewing_by").references(() => account.id),
  reviewingNote: text("reviewing_note"),
  reviewingAt: timestamp("reviewing_at", { withTimezone: true }),
  duration: text("duration"),
  opinionTier: text("opinion_tier").references(() => tier.code),
  recommends: boolean("recommends"),
  /** 玩家提交尚未建档的地图包/地图/挑战时保存的原始文字，建档后清空。 */
  proposedTarget: jsonb("proposed_target"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  check("submission_target_shape", sql`${table.challengeId} IS NOT NULL OR ${table.proposedTarget} IS NOT NULL`),
  // 允许重复提交；公开成绩由投影按玩家与挑战去重。
  index("submission_accepted_at_idx").on(table.acceptedAt),
  index("submission_challenge_idx").on(table.challengeId),
  index("submission_player_idx").on(table.playerId),
]);

export const submissionTag = pgTable("submission_tag", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  submissionId: integer("submission_id").notNull().references(() => submission.id, { onDelete: "cascade" }),
  /** mark 流程标记 | badge 颜色标签 | note 说明标签。 */
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  color: text("color"),
}, (table) => [
  index("submission_tag_submission_idx").on(table.submissionId),
]);

export const wishlistEntry = pgTable("wishlist_entry", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  challengeId: integer("challenge_id").notNull().references(() => challenge.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  progress: integer("progress").notNull().default(0),
  bestDeaths: integer("best_deaths"),
  comment: text("comment"),
  practiceDuration: text("practice_duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("wishlist_account_challenge_key").on(table.accountId, table.challengeId),
]);

/** 每日总结逐群发送领取；未知回执不自动重发。 */
export const dailySummaryDelivery = pgTable("daily_summary_delivery", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  summaryDate: date("summary_date").notNull(),
  groupId: text("group_id").notNull(),
  status: text("status").notNull().default("claimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  messageId: text("message_id"),
}, table => [
  uniqueIndex("daily_summary_delivery_date_group_key").on(table.summaryDate, table.groupId),
  check("daily_summary_delivery_status_known", sql`${table.status} IN ('claimed', 'sent', 'failed')`),
]);
