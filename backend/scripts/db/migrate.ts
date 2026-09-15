/** 应用已提交的 Drizzle 迁移，不使用 schema push。 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { repositoryRoot } from "../../src/config";
import { db, pool } from "../../src/db/client";
try { await migrate(db, { migrationsFolder: resolve(repositoryRoot, "backend/drizzle") }); console.log("Database migrations applied."); }
finally { await pool.end(); }
