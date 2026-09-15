/** 备份恢复只允许空目标库，避免误覆盖现有数据。 */
import { open } from "node:fs/promises";
import { pool } from "../../src/db/client";
import { pgTool } from "./pg-tools";
const file = process.argv[2];
try {
  if (!file) throw new Error("用法：npm run db:restore -- <postgres.dump>");
  const tables = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE'");
  if (tables.rows.length) throw new Error("恢复目标必须为空数据库");
  const input = await open(file, "r");
  try { await pgTool("pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-acl"], [input.fd, "inherit", "inherit"]); }
  finally { await input.close(); }
} finally { await pool.end(); }
