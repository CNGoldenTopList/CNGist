/** PostgreSQL 连接池与 Drizzle 入口。 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { getConfig } from "../config";
const config = getConfig().database;
export const pool = new Pool({ connectionString: config.url, max: config.maxConnections, idleTimeoutMillis: 30_000 });
export const db = drizzle(pool, { schema });
