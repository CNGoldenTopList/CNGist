import { and, eq, inArray } from "drizzle-orm";
import { isStandardTier, isTierCode } from "../../../../shared/src/tiers";
import { submission } from "../../db/schema";
import type { Tx } from "../admin/audit";

/** 调档与重审共用事务；保留验片历史、标签和回收状态。 */
export async function pendUnverifiedOnPromotion(
  tx: Tx, challengeId: number, beforeTier: string | null | undefined,
  afterTier: string | null | undefined, recordIds?: number[],
) {
  if (!isStandardTier(beforeTier) || !isTierCode(afterTier) || recordIds?.length === 0) return 0;
  const rows = await tx.update(submission).set({
    status: "pending", reviewingBy: null, reviewingNote: null, reviewingAt: null,
  }).where(and(
    eq(submission.challengeId, challengeId), eq(submission.verified, false),
    recordIds ? inArray(submission.id, recordIds) : undefined,
  )).returning({ id: submission.id });
  return rows.length;
}
