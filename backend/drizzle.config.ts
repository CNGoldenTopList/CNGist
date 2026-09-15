import { defineConfig } from "drizzle-kit";
import { getConfig } from "./src/config";
export default defineConfig({ schema: "./src/db/schema/index.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: getConfig().database.url }, casing: "snake_case" });
