/** 历史新身份申请的只读投影；新认领统一走 player-binding。 */
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { playerClaimRequest, type PlayerClaimRequest } from "../../db/schema/index";

export type PlayerClaimRequestPayload = {
  id: number;
  bilibiliUid: string;
  bilibiliName: string;
  nameSource: "fetched" | "manual";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewNote?: string;
};

export function toClaimRequestPayload(row: PlayerClaimRequest): PlayerClaimRequestPayload {
  return {
    id: row.id,
    bilibiliUid: row.bilibiliUid,
    bilibiliName: row.bilibiliName,
    nameSource: row.nameSource === "manual" ? "manual" : "fetched",
    status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
    createdAt: row.createdAt.toISOString(),
    reviewNote: row.reviewNote ?? undefined,
  };
}

/** 账户最近一条申请：用来在认领页展示「审核中/已驳回」状态，不区分是否已完结。 */
export async function myPlayerClaimRequest(accountId: number): Promise<PlayerClaimRequest | null> {
  const rows = await db.select().from(playerClaimRequest)
    .where(eq(playerClaimRequest.accountId, accountId))
    .orderBy(desc(playerClaimRequest.createdAt)).limit(1);
  return rows[0] ?? null;
}
