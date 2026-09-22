/** 有界 SVG → PNG 渲染；不启动浏览器，不请求头像或远程资源。 */
import sharp from "sharp";
import { color, clean, escape, createLineLayout, berries } from "./svg-style.mjs";
import { createHash } from "node:crypto";
import { tsImport } from "tsx/esm/api";
import { onlineTierLabel, onlineLiveRoom } from "./online.mjs";
const { challengeDisplayName } = await tsImport("../shared/src/labels.ts", import.meta.url);
sharp.cache(false);
sharp.concurrency(1);
function routeProgress(player) {
  return Number.isSafeInteger(player.position) && Number.isSafeInteger(player.routeLength)
    && player.position >= 1 && player.routeLength > 0 && player.position <= player.routeLength
    ? { position: player.position, length: player.routeLength } : null;
}
function visibleRows(players) {
  return players.map(p => ({ name: clean(p.playerName), fromWishlist: p.source === "wishlist", golden: p.activity === "golden", tier: p.tier,
    map: `${clean(p.campaignCnName) || clean(p.campaignName)} › ${clean(p.mapCnName) || clean(p.mapName)}`,
    liveRoom: onlineLiveRoom(p.liveUrl), progress: routeProgress(p), challenge: challengeDisplayName({ name: clean(p.challengeName) }) }));
}
export async function onlineSvg(rows, { golden, total, page, pages, updatedAt }) {
  const lines = createLineLayout();
  const layout = [];
  for (const row of rows) layout.push({ ...row, nameLine: (await lines(row.name, 420, 28, 1, true))[0],
    mapLines: await lines(row.map, row.progress ? 645 : 800, 24, 2), challengeLines: await lines(row.challenge, 694, 22, 2) });
  const rowHeight = row => 124 + (row.mapLines.length - 1) * 27 + (row.challengeLines.length - 1) * 26 + (row.liveRoom ? 26 : 0);
  const width = 900, top = 198, height = top + layout.reduce((sum, row) => sum + rowHeight(row), 0) + 92;
  const muted = color("--fg-muted"), fg = color("--n-50"), line = color("--border-subtle");
  const text = (x, y, value, size = 24, fill = fg, weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${escape(value)}</text>`;
  const centeredText = (x, y, value, fill, weight = 400) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="22" fill="${fill}" font-weight="${weight}">${escape(value)}</text>`;
  const berry = (x, y, size) => `<image xlink:href="data:image/png;base64,${berries.get(size)}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
  const target = (x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 32 32"><g fill="none" stroke="${muted}" stroke-width="2.4"><circle cx="14" cy="18" r="11"/><circle cx="14" cy="18" r="6"/><path d="M14 18L28 4M22 4v6h6"/></g></svg>`;
  const output = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" font-family="DejaVu Sans, Droid Sans Fallback, sans-serif"><rect width="100%" height="100%" fill="${color("--bg-page")}"/>`,
    berry(28, 27, 76), text(120, 65, "CN 金榜", 37, color("--brand-mark"), 700), text(120, 115, "在线玩家", 42, fg, 700),
    `<path d="M32 138H868" stroke="${line}"/>`, berry(30, 154, 28), text(66, 177, `带金 ${golden} 人`, 23, muted),
    target(245, 154, 28), text(281, 177, `练习 ${total - golden} 人`, 23, muted), text(626, 177, `更新于 ${updatedAt}`, 18, muted)];
  let y = top;
  layout.forEach((row, index) => {
    const h = rowHeight(row), tierColor = color(`--tier-${row.tier}`);
    output.push(`<rect x="24" y="${y}" width="852" height="${h}" fill="${index % 2 ? color("--bg-page") : color("--n-950")}"/><rect x="24" y="${y}" width="5" height="${h}" fill="${tierColor}"/>`,
      text(47, y + 36, row.nameLine, 28, fg, 700),
      `<rect x="494" y="${y + 10}" width="104" height="34" rx="5" fill="none" stroke="${muted}"/>`,
      row.golden ? berry(506, y + 12, 30) : target(507.5, y + 13.5, 27), centeredText(564, y + 27, row.golden ? "带金" : "练习", muted),
      `<rect x="710" y="${y + 10}" width="143" height="36" rx="6" fill="none" stroke="${tierColor}" stroke-width="1.5"/>`,
      centeredText(781.5, y + 28, onlineTierLabel(row.tier, false), tierColor, 700));
    if (row.progress) {
      output.push(`<g data-route-progress="${row.progress.position}/${row.progress.length}">`,
        `<text x="781.5" y="${y + 71}" text-anchor="middle" font-size="18" fill="${muted}">${row.progress.position} / ${row.progress.length}</text>`,
        `<rect x="710" y="${y + 82}" width="143" height="6" rx="3" fill="${line}"/>`,
        `<rect x="710" y="${y + 82}" width="${143 * row.progress.position / row.progress.length}" height="6" rx="3" fill="${color("--fg-subtle")}"/>`, "</g>");
    }
    row.mapLines.forEach((s, i) => output.push(text(47, y + 70 + i * 27, s, 24)));
    const challengeY = y + 105 + (row.mapLines.length - 1) * 27;
    output.push(text(47, challengeY, row.fromWishlist ? "挑战" : "推测挑战", 20, muted));
    row.challengeLines.forEach((s, i) => output.push(text(151, challengeY + i * 26, s, 22)));
    if (row.liveRoom) output.push(text(47, challengeY + (row.challengeLines.length - 1) * 26 + 26, `直播中 · 直播间号：${row.liveRoom}`, 18, muted));
    y += h;
    output.push(`<path d="M29 ${y}H876" stroke="${line}"/>`);
  });
  const foot = y;
  output.push(text(32, foot + 38, "展示正式 Tier / 未决定挑战的练习、带金玩家", 19, muted), text(742, foot + 38, `第 ${page}/${pages} 页`, 19, muted),
    text(32, foot + 69, pages > 1 ? `共 ${total} 人 · 使用 /online 页码 翻页，例如 /online ${page < pages ? page + 1 : 1}` : `共 ${total} 人 · 状态以查询时为准`, 18, muted), "</svg>");
  return output.join("");
}
let cached = null;
let active = null;
export async function renderOnlineImage(players, page = 1) {
  const rows = visibleRows(players.slice((page - 1) * 10, page * 10));
  const golden = players.filter(p => p.activity === "golden").length;
  const total = players.length, pages = Math.ceil(total / 10);
  const key = createHash("sha256").update(JSON.stringify({ rows, golden, total, page })).digest("hex");
  if (cached?.key === key && Date.now() - cached.at < 5000) return cached.png;
  if (active) {
    if (active.key === key) return active.promise;
    // 不积累无界的渲染队列；跨页并发由调用方给出简短提示。
    throw new Error("在线图片渲染忙");
  }
  const promise = (async () => {
    const updatedAt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
    const svg = await onlineSvg(rows, { golden, total, page, pages, updatedAt });
    const png = await sharp(Buffer.from(svg), { limitInputPixels: 2_500_000 }).png({ compressionLevel: 3 }).toBuffer();
    if (png.length > 2 * 1024 * 1024) throw new Error("在线图片超出体积上限");
    cached = { key, png, at: Date.now() };
    return png;
  })();
  active = { key, promise };
  try { return await promise; } finally { active = null; }
}
