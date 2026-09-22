import { tierIndex, isStandardTier } from "./tiers";
import type { DifficultyCode } from "./types";

const beijingDate = (date: Date) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

const DAY = 86_400_000;
export function dailySummaryWindow(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("总结日期无效");
  const end = new Date(`${date}T22:30:00+08:00`);
  if (!Number.isFinite(end.getTime()) || beijingDate(end) !== date) throw new Error("总结日期无效");
  return { date, from: new Date(end.getTime() - DAY).toISOString(), to: end.toISOString() };
}
/** 最近一个已到达的 22:30；用于默认页面和定时推送。 */
export function latestDailySummaryDate(now = new Date()) {
  const date = beijingDate(now);
  return now.getTime() >= Date.parse(dailySummaryWindow(date).to) ? date : beijingDate(new Date(now.getTime() - DAY));
}
export const dailySummaryDateLabel = (date: string) => date.split("-").map(Number).join("-");
export type DailySummaryRecord = {
  id: number; playerId: number; playerName: string;
  challengeId: number; challengeName: string; tier: DifficultyCode;
  mapId: number | null; mapName: string | null; mapCnName: string | null;
  campaignId: number; campaignName: string; campaignCnName: string | null;
  acceptedAt: string;
};
export type DailySummary = ReturnType<typeof dailySummaryWindow> & {
  records: DailySummaryRecord[]; stdCount: number;
};
export function sortDailySummaryRecords(records: DailySummaryRecord[]) {
  return [...records].sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier)
    || a.acceptedAt.localeCompare(b.acceptedAt) || a.id - b.id);
}
export function dailySummaryImagePages(records: DailySummaryRecord[]) {
  const visible = sortDailySummaryRecords(records).filter(r => !isStandardTier(r.tier));
  return Array.from({ length: Math.ceil(visible.length / 10) }, (_, page) => visible.slice(page * 10, page * 10 + 10));
}
