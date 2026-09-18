/** 仅投影网站信息区需要的公开名称与有效玩家链接。 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { account, player } from "../../db/schema";

export async function siteAdministrators() {
  const rows = await db.select({ name: player.name, displayName: account.displayName, playerId: player.id })
    .from(account)
    .leftJoin(player, and(eq(account.claimedPlayerId, player.id), isNull(player.deletedAt)))
    .where(and(eq(account.role, "admin"), eq(account.status, "active")))
    .orderBy(asc(account.id));
  return rows.map(row => ({ name: row.name ?? row.displayName, playerId: row.playerId }));
}
