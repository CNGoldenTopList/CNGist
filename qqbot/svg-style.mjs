import sharp from "sharp";
import { readFile } from "node:fs/promises";
const css = await readFile(new URL("../frontend/src/styles/tokens.css", import.meta.url), "utf8");
// 指令图片固定使用默认暗色，只读取无主题限定的 :root，避免亮色覆盖值混入。
const darkCss = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/:root\s*\{([^{}]*)\}/g)].map(m => m[1]).join("\n");
const tokens = new Map([...darkCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
export const color = (name, depth = 0) => {
  const value = tokens.get(name);
  if (depth > 5 || !value) throw new Error(`缺失样式令牌 ${name}`);
  return value.startsWith("var(") ? color(value.slice(4, -1), depth + 1) : value;
};
// 从 ICO 直接提取最大 PNG 帧；在初始化时按最近邻缩放成三种小图，避免每次描绘数千个像素矩形。
const ico = await readFile(new URL("../frontend/public/favicon.ico", import.meta.url));
let best = null;
for (let i = 0; i < ico.readUInt16LE(4); i++) {
  const p = 6 + i * 16, size = ico.readUInt32LE(p + 8), offset = ico.readUInt32LE(p + 12);
  const width = ico[p] || 256;
  if (!best || width > best.width) best = { width, png: ico.subarray(offset, offset + size) };
}
export const berries = new Map();
for (const size of [28, 30, 76]) berries.set(size, (await sharp(best.png).resize(size, size, { kernel: "nearest" }).png().toBuffer()).toString("base64"));
export const clean = value => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
export const escape = value => clean(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
// 与 SVG 使用相同的 Pango 字体排版器测量实际字宽；缓存仅存在于本次渲染。
export function createLineLayout() {
  const widths = new Map();
  async function measure(value, size, bold) {
    if (!value.trim()) return 0;
    const key = `${size}/${bold}/${value}`;
    if (!widths.has(key)) {
      const metadata = await sharp({ text: { text: escape(value), font: `DejaVu Sans, Droid Sans Fallback ${bold ? "Bold " : ""}${size}`, dpi: 72, rgba: true } }).metadata();
      widths.set(key, metadata.width);
    }
    return widths.get(key);
  }
  return async function lines(value, width, size, maxLines = 1, bold = false) {
    let remaining = Array.from(clean(value).slice(0, 4000));
    const result = [];
    while (remaining.length && result.length < maxLines) {
      // 每次测量最多 256 个字符，不为异常长输入分配超宽画布。
      const cap = Math.min(remaining.length, 256);
      const whole = remaining.slice(0, cap).join("");
      if (cap === remaining.length && await measure(whole, size, bold) <= width - 2) {
        result.push(whole); break;
      }
      const last = result.length === maxLines - 1;
      let lo = 0, hi = cap;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (await measure(remaining.slice(0, mid).join("") + (last ? "…" : ""), size, bold) <= width - 2) lo = mid;
        else hi = mid - 1;
      }
      let count = Math.max(1, lo);
      // 英文优先在词边界折行，单个超长词才按字符切开。
      if (!last && count < remaining.length && /[a-z0-9]/i.test(remaining[count - 1]) && /[a-z0-9]/i.test(remaining[count])) {
        const boundary = remaining.slice(0, count).lastIndexOf(" ");
        if (boundary > count / 2) count = boundary;
      }
      result.push(remaining.slice(0, count).join("").trimEnd() + (last ? "…" : ""));
      remaining = remaining.slice(count);
      while (remaining[0] === " ") remaining.shift();
    }
    return result.length ? result : [""];
  };
}
