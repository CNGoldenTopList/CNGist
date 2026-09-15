/** 只读取网站公开在线接口；Tier、挑战显示名复用网站规则。 */
import { tsImport } from "tsx/esm/api";
const [{ tierOrder, tierDisplayLabel }, { challengeDisplayName }] = await Promise.all([
  tsImport("../shared/src/tiers.ts", import.meta.url),
  tsImport("../shared/src/labels.ts", import.meta.url),
]);

const field = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function selectOnlinePlayers(players) {
  return players.filter((player) => player && ["golden", "practice"].includes(player.activity)
    && player.playerId && player.mapId && player.campaignId && player.challengeId
    && field(player.challengeName) && tierOrder.includes(player.tier))
    .sort((a, b) => Number(b.activity === "golden") - Number(a.activity === "golden")
      || tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
      || field(a.playerName).localeCompare(field(b.playerName), "zh-CN")
      || String(a.playerId).localeCompare(String(b.playerId)));
}

// 正常按玩家整块分页；异常超长名称按字符分段，避免消息超长导致整份列表发不出去。
function splitBlock(value, limit) {
  const parts = [];
  let part = "";
  for (const char of value) {
    if (part.length + char.length > limit) { parts.push(part); part = ""; }
    part += char;
  }
  if (part) parts.push(part);
  return parts;
}

export function formatOnlinePlayers(players, limit = 2000) {
  const selected = selectOnlinePlayers(players);
  if (!selected.length) return ["CN 金榜 · 在线玩家\n\n暂无正在练习或带金、且推测挑战上榜的玩家。"];
  const golden = selected.filter((player) => player.activity === "golden").length;
  const heading = `CN 金榜 · 在线玩家\n🍓 带金 ${golden} 人　·　🎯 练习 ${selected.length - golden} 人`;
  const budget = limit - heading.length - 40;
  if (budget < 4) throw new Error("QQBOT_REPLY_LIMIT 太小，无法展示在线列表");
  const pages = [];
  let page = "";
  for (const player of selected) {
    const block = [
      `${player.activity === "golden" ? "🍓 带金" : "🎯 练习"} · ${field(player.playerName)}`,
      `  ${field(player.campaignCnName) || field(player.campaignName)} › ${field(player.mapCnName) || field(player.mapName)}`,
      `  推测：${tierDisplayLabel(player.tier, true)} · ${challengeDisplayName({ name: field(player.challengeName) })}`,
    ].join("\n");
    for (const part of splitBlock(block, budget)) {
      if (page && page.length + 2 + part.length > budget) { pages.push(page); page = ""; }
      page += (page ? "\n\n" : "") + part;
    }
  }
  if (page) pages.push(page);
  return pages.map((body, index) => `${heading}\n━━━━━━━━━━━━\n${body}${pages.length > 1 ? `\n\n第 ${index + 1}/${pages.length} 页` : ""}`);
}

export function createOnlineCommand({ url = "http://127.0.0.1:8268/api/online", fetchImpl = fetch,
  render = async (...args) => (await import("./online-image.mjs")).renderOnlineImage(...args) } = {}) {
  let pending = null;
  return async ({ rest = "" } = {}) => {
    if (rest && !/^[1-9]\d{0,5}$/.test(rest)) return ["用法：/online 或 /online 2（页码）"];
    const page = Number(rest || 1);
    if (!pending) {
      pending = (async () => {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.players)) throw new Error("无效在线列表");
        return selectOnlinePlayers(data.players);
      })().finally(() => { pending = null; });
    }
    let players;
    try { players = await pending; }
    catch (error) {
      process.stderr.write(`[qqbot] 在线列表读取失败：${error.message}\n`);
      return ["CN 金榜 · 在线玩家\n\n暂时无法获取在线列表，请稍后再试。"];
    }
    if (!players.length) return formatOnlinePlayers([]);
    const pages = Math.ceil(players.length / 10);
    if (page > pages) return [`当前共 ${pages} 页，请使用 /online 1 至 /online ${pages}。`];
    try { return [{ type: "image", png: await render(players, page) }]; }
    catch (error) {
      process.stderr.write(`[qqbot] 在线图片生成失败：${error.message}\n`);
      return ["CN 金榜 · 在线玩家\n图片暂时无法生成，请稍后再试。"];
    }
  };
}
