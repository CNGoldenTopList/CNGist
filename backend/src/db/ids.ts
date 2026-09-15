/** 使用数据库 identity 序列预分配事务内需要引用的实体 ID。 */
import { sql } from "drizzle-orm";
import { db } from "./client";
import type { Tx } from "../modules/admin/audit";
export async function nextEntityId(entity: "campaign" | "map" | "challenge" | "player" | "submission" | "feedback_attachment" | "feedback_report" | "suggestion" | "campaign_hall" | "submission_tag", tx: Pick<Tx, "execute"> = db) {
  const result = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence(${entity}, 'id'))::integer as id`);
  return result.rows[0].id;
}
