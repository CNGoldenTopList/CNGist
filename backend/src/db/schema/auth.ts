/** auth 表结构。 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { AccountPreferences } from "../../../../shared/src/account-preferences";
import type { AccountRole } from "../../../../shared/src/account-roles";
import { player } from "./players";

export const account = pgTable("account", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  displayName: text("display_name").notNull(),
  /** 仅用于联系与找回，**不是身份键**。身份键永远是 auth_identity 的 (provider, subject)。 */
  email: text("email"),
  emailVerified: boolean("email_verified").notNull().default(false),
  role: text("role").$type<AccountRole>().notNull().default("player"),
  status: text("status").notNull().default("active"),
  /** 认领的玩家，身份以服务端会话与此关联为准。 */
  claimedPlayerId: integer("claimed_player_id").references((): AnyPgColumn => player.id),
  claimedBilibiliName: text("claimed_bilibili_name"),
  bilibiliUid: text("bilibili_uid"),
  qqLinked: boolean("qq_linked").notNull().default(false),
  /** 界面偏好。半结构化且只整体读写，jsonb 正合适。 */
  preferences: jsonb("preferences").$type<AccountPreferences>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // 大小写不敏感的唯一性。email 可空，Postgres 允许多个 NULL，正合需要。
  uniqueIndex("account_email_lower_key").on(sql`lower(${table.email})`),
  // 一个 B 站身份只能被一个账户认领。可空列上多个 NULL 不冲突。
  uniqueIndex("account_claimed_player_key").on(table.claimedPlayerId),
  check("account_role_known", sql`${table.role} IN ('player', 'admin', 'super_admin')`),
]);

export const authIdentity = pgTable("auth_identity", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  /** 'password' | 'diving-fish' | 将来的其他 provider */
  provider: text("provider").notNull(),
  /** provider 内的稳定标识：password 用规范化邮箱，OIDC 用 sub。 */
  subject: text("subject").notNull(),
  /** 口令派生值，仅 provider='password' 时有值；OIDC 行为 NULL。 */
  secret: text("secret"),
  email: text("email"),
  /** provider 是否声明该邮箱已验证。未验证时**禁止**据此合并账号。 */
  emailVerified: boolean("email_verified").notNull().default(false),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (table) => [
  // 身份唯一键。绝不用 email 充当这个角色。
  uniqueIndex("auth_identity_provider_subject_key").on(table.provider, table.subject),
  // 同一个账户在同一个 provider 下只能绑一次
  uniqueIndex("auth_identity_account_provider_key").on(table.accountId, table.provider),
]);

export const session = pgTable("session", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  /** Cookie 里是原值，这里只存 SHA-256。库被读走也不能直接冒充。 */
  tokenHash: text("token_hash").notNull(),
  /** 本次会话的认证方式，审计用。对应 OIDC 的 amr。 */
  amr: text("amr").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (table) => [
  uniqueIndex("session_token_hash_key").on(table.tokenHash),
  index("session_account_idx").on(table.accountId),
  index("session_expires_idx").on(table.expiresAt),
]);

export type Account = typeof account.$inferSelect;

export type AuthIdentity = typeof authIdentity.$inferSelect;

export type Session = typeof session.$inferSelect;

export const emailToken = pgTable("email_token", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  /** 'verify' 邮箱验证 | 'reset' 密码重置 */
  purpose: text("purpose").notNull(),
  tokenHash: text("token_hash").notNull(),
  /** 签发时的目标邮箱。之后账户改了邮箱，旧链接就该失效。 */
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("email_token_hash_key").on(table.tokenHash),
  index("email_token_account_purpose_idx").on(table.accountId, table.purpose),
]);

export type EmailToken = typeof emailToken.$inferSelect;
