/** catalog 表结构。 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { imageAsset } from "./assets";
import { account } from "./auth";

export const tier = pgTable("tier", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** TierCode 本体（"t-1"、"h0"…），外加非正式档位 "high-std" / "mid-std" / "low-std"（低于 T7）与 "undetermined"（未定档）。 */
  code: text("code").notNull().unique(),
  /** 金榜排序靠 rank，不靠字符串。 */
  rank: integer("rank").notNull().unique(),
  label: text("label").notNull(),
  short: text("short").notNull(),
  isOfficial: boolean("is_official").notNull().default(true),
});

export const campaign = pgTable("campaign", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  cnName: text("cn_name"),
  shortName: text("short_name").notNull(),
  author: text("author").notNull().default(""),
  url: text("url").notNull().default("#"),
  notice: text("notice"),
  blurb: text("blurb").notNull().default(""),
  banner: text("banner_key").references(() => imageAsset.objectKey),
  bannerSource: text("banner_source"),
  gameBananaUrl: text("game_banana_url"),
  searchAliases: text("search_aliases").array(),
  /** 为「无归属地图」生成的单地图包，目录页默认过滤。 */
  isStandalone: boolean("is_standalone").notNull().default(false),
  sortOrder: integer("sort_order"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const map = pgTable("map", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** seed 阶段补齐：每一张地图都归入一个地图包，特判随之消失。 */
  campaignId: integer("campaign_id").notNull().references(() => campaign.id),
  name: text("name").notNull(),
  cnName: text("cn_name"),
  histStars: integer("hist_stars"),
  histSubTier: text("hist_sub_tier"),
  author: text("author").notNull().default(""),
  url: text("url").notNull().default("#"),
  primaryTier: text("primary_tier").references(() => tier.code),
  /** 编辑性导入值：5643 条记录里只有 2 条带 recommends，无法从记录导出。 */
  recommendationPercent: integer("recommendation_percent").notNull().default(0),
  rating: integer("rating").notNull().default(0),
  description: text("description").notNull().default(""),
  banner: text("banner_key").references(() => imageAsset.objectKey),
  bannerSource: text("banner_source"),
  notice: text("notice"),
  searchAliases: text("search_aliases").array(),
  sortOrder: integer("sort_order"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  check("map_hist_rating_valid", sql`(
    (${table.histStars} IS NULL AND ${table.histSubTier} IS NULL)
    OR (${table.histStars} IS NOT NULL AND ${table.histStars} = 0 AND ${table.histSubTier} IS NULL)
    OR (${table.histStars} IS NOT NULL AND ${table.histStars} BETWEEN 1 AND 5
      AND ${table.histSubTier} IS NOT NULL AND ${table.histSubTier} IN ('lower', 'upper'))
  )`),
]);

export const challenge = pgTable("challenge", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 判别列：挂在地图上（原普通挑战）还是地图包上（原多地图挑战）。 */
  scope: text("scope").notNull(),
  mapId: integer("map_id").references(() => map.id),
  campaignId: integer("campaign_id").references(() => campaign.id),
  name: text("name").notNull(),
  /** C / FC / C/FC / All Major Secrets / Silver Segment / Other；多地图挑战为空。 */
  type: text("type"),
  tierCode: text("tier_code").references(() => tier.code),
  description: text("description").notNull().default(""),
  notice: text("notice"),
  sortOrder: integer("sort_order"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  // 两个父外键互斥：挂在 map 上或挂在 campaign 上，必居其一。
  check("challenge_scope_shape", sql`(
    (${table.scope} = 'map' AND ${table.mapId} IS NOT NULL AND ${table.campaignId} IS NULL)
    OR (${table.scope} = 'campaign' AND ${table.campaignId} IS NOT NULL AND ${table.mapId} IS NULL)
  )`),
  check("challenge_scope_known", sql`${table.scope} IN ('map', 'campaign')`),
]);

export const challengeRelation = pgTable("challenge_relation", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  fromId: integer("from_id").notNull().references(() => challenge.id, { onDelete: "cascade" }),
  toId: integer("to_id").notNull().references(() => challenge.id, { onDelete: "cascade" }),
}, (table) => [
  // 方向唯一，且不允许自环。
  uniqueIndex("challenge_relation_edge_key").on(table.fromId, table.toId),
  check("challenge_relation_not_self", sql`${table.fromId} <> ${table.toId}`),
]);

export const challengeRelationOverride = pgTable("challenge_relation_override", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  mapId: integer("map_id").notNull().unique().references(() => map.id, { onDelete: "cascade" }),
  updatedBy: integer("updated_by").references(() => account.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignHall = pgTable("campaign_hall", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cnName: text("cn_name"),
  aliases: text("aliases").array(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("campaign_hall_campaign_order_idx").on(table.campaignId, table.sortOrder),
]);

export const campaignHallMap = pgTable("campaign_hall_map", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  hallId: integer("hall_id").notNull().references(() => campaignHall.id, { onDelete: "cascade" }),
  mapId: integer("map_id").notNull().references(() => map.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  uniqueIndex("campaign_hall_map_key").on(table.hallId, table.mapId),
  uniqueIndex("campaign_hall_map_map_key").on(table.mapId),
  index("campaign_hall_map_order_idx").on(table.hallId, table.sortOrder),
]);

export const campaignMenuItem = pgTable("campaign_menu_item", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  section: text("section").notNull(),
  position: integer("position").notNull(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("campaign_menu_item_slot_key").on(table.section, table.position),
  uniqueIndex("campaign_menu_item_campaign_key").on(table.campaignId),
  check("campaign_menu_item_section_known", sql`${table.section} IN ('fixed', 'default_favorite')`),
  check("campaign_menu_item_position_nonnegative", sql`${table.position} >= 0`),
]);
