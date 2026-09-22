/** 与 /online 共用站点令牌、图标、字体测量和 SVG → PNG 渲染。 */
import sharp from "sharp";
import { tsImport } from "tsx/esm/api";
import { color, escape, createLineLayout, berries } from "./svg-style.mjs";
import { onlineTierLabel } from "./online.mjs";
const { challengeDisplayName } = await tsImport("../shared/src/labels.ts", import.meta.url);
const { isStandardTier } = await tsImport("../shared/src/tiers.ts", import.meta.url);

export async function dailySummarySvg(rows, { date, page, pages }) {
  if (!rows.length || rows.length > 10 || rows.some(row => isStandardTier(row.tier))) throw new Error("总结图片须为 1–10 条非 Std 记录");
  const lines = createLineLayout(), layout = [];
  for (const row of rows) {
    const pack = row.campaignCnName || row.campaignName;
    const map = row.mapId ? `${pack} › ${row.mapCnName || row.mapName}` : pack;
    layout.push({ ...row, playerLine: (await lines(row.playerName, 630, 28, 1, true))[0],
      mapLines: await lines(map, 800, 24, 2), challengeLines: await lines(challengeDisplayName({ name: row.challengeName }), 800, 22, 2) });
  }
  const rowHeight = row => 120 + (row.mapLines.length - 1) * 27 + (row.challengeLines.length - 1) * 26;
  const height = 185 + layout.reduce((sum, row) => sum + rowHeight(row), 0) + 66;
  const fg = color("--n-50"), muted = color("--fg-muted"), border = color("--border-subtle");
  const text = (x, y, value, size = 24, fill = fg, weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${escape(value)}</text>`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="900" height="${height}" font-family="DejaVu Sans, Droid Sans Fallback, sans-serif"><rect width="100%" height="100%" fill="${color("--bg-page")}"/>`,
    `<image xlink:href="data:image/png;base64,${berries.get(76)}" x="28" y="27" width="76" height="76"/>`,
    text(120, 65, "CN 金榜", 37, color("--brand-mark"), 700), text(120, 115, "每日总结", 42, fg, 700),
    `<path d="M32 138H868" stroke="${border}"/>`, text(32, 169, `${date} · 今日通过的挑战`, 23, muted), text(706, 169, `第 ${page}/${pages} 张`, 20, muted)];
  let y = 185;
  for (const [i, row] of layout.entries()) {
    const h = rowHeight(row), tierColor = color(`--tier-${row.tier}`);
    out.push(`<g data-record-id="${Number(row.id)}"><rect x="24" y="${y}" width="852" height="${h}" fill="${color(i % 2 ? "--bg-page" : "--n-950")}"/><rect x="24" y="${y}" width="5" height="${h}" fill="${tierColor}"/>`,
      text(47, y + 36, row.playerLine, 28, fg, 700),
      `<rect x="710" y="${y + 10}" width="143" height="36" rx="6" fill="none" stroke="${tierColor}" stroke-width="1.5"/>`,
      `<text x="781.5" y="${y + 28}" text-anchor="middle" dominant-baseline="central" font-size="22" fill="${tierColor}" font-weight="700">${escape(onlineTierLabel(row.tier, false))}</text>`);
    row.mapLines.forEach((line, i) => out.push(text(47, y + 70 + i * 27, line)));
    row.challengeLines.forEach((line, i) => out.push(text(47, y + 103 + (row.mapLines.length - 1) * 27 + i * 26, line, 22, muted)));
    y += h;
    out.push(`<path d="M29 ${y}H876" stroke="${border}"/></g>`);
  }
  out.push(text(32, y + 40, "北京时间前一日 22:30 至当日 22:30 · 完整记录见每日总结页", 20, muted), "</svg>");
  return out.join("");
}
export async function renderDailySummaryImage(rows, meta) {
  const png = await sharp(Buffer.from(await dailySummarySvg(rows, meta)), { limitInputPixels: 2_500_000 }).png({ compressionLevel: 3 }).toBuffer();
  if (png.length > 2 * 1024 * 1024) throw new Error("总结图片超出体积上限");
  return png;
}
