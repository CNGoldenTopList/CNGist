import { and, eq, ne, sql } from "drizzle-orm";
import { player, playerClaimRequest } from "../../db/schema/index";
import type { Tx } from "../admin/audit";

/** 串行化名称占用检查与写入，兼容历史重名数据，不擅自重命名。 */
export async function lockPlayerNames(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(8267, 1)`);
}

/** 回收的档案仍保留名字；待审申请也占用名字。 */
export async function playerNameTaken(tx: Tx, name: string, exceptPlayer?: number, exceptRequest?: number) {
  const [existing] = await tx.select({ id: player.id }).from(player).where(and(
    sql`lower(btrim(${player.name})) = lower(btrim(${name}))`,
    exceptPlayer ? ne(player.id, exceptPlayer) : undefined,
  )).limit(1);
  if (existing) return true;
  const [pending] = await tx.select({ id: playerClaimRequest.id }).from(playerClaimRequest).where(and(
    eq(playerClaimRequest.status, "pending"),
    sql`lower(btrim(${playerClaimRequest.bilibiliName})) = lower(btrim(${name}))`,
    exceptRequest ? ne(playerClaimRequest.id, exceptRequest) : undefined,
  )).limit(1);
  return Boolean(pending);
}

export function playerHasBilibiliUid(uid: string) {
  return sql`(${player.bilibiliUid} = ${uid} OR ${uid} = ANY(${player.bilibiliUids}) OR ${player.bilibiliUrl} = ${`https://space.bilibili.com/${uid}`})`;
}
