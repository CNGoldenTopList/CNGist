import { integer, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { account } from "./auth";

/** 仅供单条成绩补录及重复检查，不是会话或通用管理员 API 凭据。 */
export const submissionToken = pgTable("submission_token", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  accountId: integer("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [uniqueIndex("submission_token_hash_key").on(table.tokenHash), index("submission_token_account_idx").on(table.accountId)]);
