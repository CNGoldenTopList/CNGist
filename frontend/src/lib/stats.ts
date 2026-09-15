/** 推荐比例与难度意见统计。 */
import type { Submission, TierCode } from "@shared/types";
import { tierIndex } from "@shared/tiers";

export function recommendationStats(records: Submission[]) {
  const votes = records.filter((record) => typeof record.recommends === "boolean");
  const yes = votes.filter((record) => record.recommends === true).length;
  const no = votes.filter((record) => record.recommends === false).length;
  return { yes, no, total: votes.length, percent: votes.length ? Math.round((yes / votes.length) * 100) : null };
}

export function challengeDifficultyIndex(tier: TierCode | null | undefined) {
  return tier ? tierIndex(tier) : Number.POSITIVE_INFINITY;
}
