import { Pool } from "pg";
import { tsImport } from "tsx/esm/api";
import { appConfig } from "./config.mjs";
import { renderDailySummaryImage } from "./daily-summary-image.mjs";
const { latestDailySummaryDate, dailySummaryWindow, dailySummaryDateLabel, dailySummaryImagePages } = await tsImport("../shared/src/daily-summary.ts", import.meta.url);

export async function fetchDailySummary(url, date) {
  const target = new URL(url);
  target.searchParams.set("date", date);
  const response = await fetch(target, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`每日总结接口 HTTP ${response.status}`);
  const summary = await response.json();
  if (summary.date !== date || !Array.isArray(summary.records) || !Number.isSafeInteger(summary.stdCount)) throw new Error("每日总结接口数据无效");
  return summary;
}
export async function buildDailySummaryNodes(summary, origin, render = renderDailySummaryImage) {
  const pages = dailySummaryImagePages(summary.records);
  const nodes = [`${dailySummaryDateLabel(summary.date)} 每日总结：`];
  for (const [i, rows] of pages.entries()) nodes.push(await render(rows, { date: summary.date, page: i + 1, pages: pages.length }));
  const link = new URL("/daily-summary", origin);
  link.searchParams.set("date", summary.date);
  if (!summary.records.length) nodes.push("本期暂无通过的挑战。");
  nodes.push(`还有 ${summary.stdCount} 个 std 挑战未显示，详情可以到【${link.href}】查看`);
  return nodes;
}

export function createDailySummaryStore(pool) {
  return {
    async remaining(date, groups) {
      const { rows } = await pool.query("SELECT group_id FROM daily_summary_delivery WHERE summary_date=$1 AND group_id=ANY($2::text[])", [date, groups]);
      const claimed = new Set(rows.map(r => r.group_id));
      return groups.filter(group => !claimed.has(group));
    },
    async claim(date, group) {
      const { rows } = await pool.query("INSERT INTO daily_summary_delivery(summary_date,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id", [date, group]);
      return rows[0]?.id ?? null;
    },
    async finish(id, status, messageId = null) {
      await pool.query("UPDATE daily_summary_delivery SET status=$2,finished_at=now(),message_id=$3 WHERE id=$1", [id, status, messageId == null ? null : String(messageId)]);
    },
  };
}

/** 22:30 开始；断线或读取失败可在当晚补发，领取后未知回执不重试。 */
export function createDailySummaryPoller({ config, messages, connected, store,
  origin = appConfig.server.origin, now = () => new Date(), fetchSummary = fetchDailySummary, buildNodes = buildDailySummaryNodes,
  log = message => process.stderr.write(`[qqbot] ${message}\n`) }) {
  let busy = false, retryAt = 0, completedDate = null;
  return async () => {
    const groups = [...new Set(config.dailySummaryGroups ?? [])];
    if (busy || !groups.length || !connected()) return;
    const clock = now(), date = latestDailySummaryDate(clock), due = Date.parse(dailySummaryWindow(date).to);
    // 截止午夜：重启不补发昨天或更久的旧总结。
    if (clock.getTime() - due >= 90 * 60_000 || clock.getTime() < retryAt || completedDate === date) return;
    busy = true;
    try {
      const targets = await store.remaining(date, groups);
      if (!targets.length) { completedDate = date; return; }
      const summary = await fetchSummary(config.dailySummaryUrl, date);
      const nodes = await buildNodes(summary, origin);
      for (const group of targets) {
        if (!connected()) break;
        const id = await store.claim(date, group);
        if (id == null) continue;
        try {
          const result = await messages.sendDailySummary(group, nodes);
          await store.finish(id, "sent", result.messageId);
          process.stdout.write(`[qqbot] 每日总结 ${date} 已发送至 ${group}\n`);
        } catch (error) {
          // 即使写回失败，持久化的 claim 仍防止重启后重复发消息。
          await store.finish(id, "failed").catch(() => {});
          log(`每日总结 ${date} 群 ${group} 发送失败或回执未知，不自动重发：${error.message}`);
        }
      }
    } catch (error) { log(`每日总结准备失败：${error.message}`); }
    finally { retryAt = now().getTime() + 60_000; busy = false; }
  };
}
export function startDailySummaryWorker(options) {
  if (!options.config.dailySummaryGroups?.length) return () => {};
  const pool = new Pool({ connectionString: appConfig.database.url, max: 2, idleTimeoutMillis: 30_000 });
  const poll = createDailySummaryPoller({ ...options, store: createDailySummaryStore(pool) });
  const timer = setInterval(() => void poll().catch(error => process.stderr.write(`[qqbot] 每日总结任务失败：${error.message}\n`)), 5_000);
  timer.unref();
  return () => { clearInterval(timer); void pool.end(); };
}
