/** community 表结构。 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { challenge, map, campaign } from "./catalog";
import { account } from "./auth";
import { player } from "./players";
import { imageAsset } from "./assets";

export const suggestion = pgTable("suggestion", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  state: text("state").notNull(),
  source: text("source").notNull().default(""),
  /** 三个目标外键可以全为空：74 条里有 6 条是纯议题。 */
  challengeId: integer("challenge_id").references(() => challenge.id),
  mapId: integer("map_id").references(() => map.id),
  campaignId: integer("campaign_id").references(() => campaign.id),
  createdAt: text("created_at"),
  /** 历史快照，含 Std 三档，不做 tier 外键。 */
  currentTier: text("current_tier"),
  suggestedTier: text("suggested_tier"),
  resultTier: text("result_tier"),
  decision: text("decision"),
  decisionNote: text("decision_note"),
  archiveVoteScope: text("archive_vote_scope"),
  archiveVotes: jsonb("archive_votes"),
  /** 议题作者显示名。票数不进库，由 responses 现算。 */
  author: text("author").notNull().default(""),
  body: text("body").notNull().default(""),
  /** 投票截止时间。历史导入记录为空，读路径按「创建时间 + 7 天」兜底。 */
  dueAt: timestamp("due_at", { withTimezone: true }),
});

export const suggestionResponse = pgTable("suggestion_response", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  suggestionId: integer("suggestion_id").notNull().references(() => suggestion.id, { onDelete: "cascade" }),
  accountId: integer("account_id").references(() => account.id, { onDelete: "set null" }),
  player: text("player").notNull(),
  progress: text("progress").notNull().default(""),
  opinion: text("opinion").notNull().default(""),
  vote: text("vote"),
  opinionTier: text("opinion_tier"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("suggestion_response_suggestion_idx").on(table.suggestionId),
  uniqueIndex("suggestion_response_account_key").on(table.suggestionId, table.accountId),
]);

export const feedbackReport = pgTable("feedback_report", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  pageUrl: text("page_url"),
  /** 提交者显示名；登录用户顺带记 account id。 */
  reporter: text("reporter").notNull().default(""),
  reporterAccountId: integer("reporter_account_id").references(() => account.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  handledBy: integer("handled_by").references(() => account.id),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});

export const feedbackAttachment = pgTable("feedback_attachment", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  reportId: integer("report_id").references(() => feedbackReport.id, { onDelete: "cascade" }),
  /** 上传者；绑定时用它确认这行确实是同一个人传的。 */
  uploaderAccountId: integer("uploader_account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().references(() => imageAsset.objectKey),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("feedback_attachment_report_idx").on(table.reportId),
  // 清理未绑定的孤儿附件时按上传时间扫。
  index("feedback_attachment_pending_idx").on(table.uploaderAccountId, table.createdAt),
]);

export const qaEntry = pgTable("qa_entry", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 分组：rules 是挑战规则，general 是榜单与站点的通用问题；页面按此分成两块。 */
  category: text("category").notNull().default("general"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  questionEn: text("question_en"),
  answerEn: text("answer_en"),
  /** 展示顺序，数值小的在前；相同时按创建时间。分组之间不共享顺序。 */
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("qa_entry_order_idx").on(t.position, t.createdAt),
  check("qa_entry_category", sql`${t.category} IN ('rules', 'general')`)]);
