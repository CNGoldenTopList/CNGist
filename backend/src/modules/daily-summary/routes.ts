import { db } from "../../db/client";
import { jsonResponse, requestUrl, type ApiRequest } from "../../plugins/http";
import { dailySummaryWindow, latestDailySummaryDate, sortDailySummaryRecords, type DailySummaryRecord } from "../../../../shared/src/daily-summary";
import { isStandardTier } from "../../../../shared/src/tiers";
import { dailySummaryQuery } from "./query";

export async function GET(request: ApiRequest) {
  const date = requestUrl(request).searchParams.get("date") ?? latestDailySummaryDate();
  let window;
  try { window = dailySummaryWindow(date); }
  catch { return jsonResponse({ error: "总结日期无效，请使用 YYYY-MM-DD。" }, { status: 400 }); }
  const result = await db.execute<Omit<DailySummaryRecord, "acceptedAt"> & { acceptedAt: Date | string }>(dailySummaryQuery(date));
  const records = sortDailySummaryRecords(result.rows.map(r => ({ ...r, acceptedAt: new Date(r.acceptedAt).toISOString() })));
  return jsonResponse({ ...window, records, stdCount: records.filter(r => isStandardTier(r.tier)).length },
    { headers: { "Cache-Control": "no-store" } });
}
