/** assets 表结构。 */
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const imageAsset = pgTable("image_asset", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
