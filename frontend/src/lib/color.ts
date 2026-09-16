/**
 * 亮色主题下的 Tier 色偏移。
 *
 * 17 档 Tier 色是按深色地面调的，大半落在 OKLCH 明度 0.85–0.96 的高亮档，
 * 放到白色地面上浅档几乎与底色融为一体。这里在 OKLCH 里统一压低明度，
 * 色相不动、档位之间的相对关系不变；压暗后超出 sRGB 的颜色靠降彩度收回。
 *
 * 认不出的颜色原样返回 —— 自定义配色顶多不偏移，不会被写坏。
 */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklch(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const full = match[1].length === 3 ? [...match[1]].map((ch) => ch + ch).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((at) => toLinear(parseInt(full.slice(at, at + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** 在 OKLCH 里把明度降低 `delta`（0–1）。 */
export function darkenOklch(color: string, delta: number): string {
  const lch = hexToOklch(color);
  if (!lch || delta <= 0) return color;
  const [L0, C0, h] = lch;
  const L = Math.max(0, L0 - delta);
  let C = C0;
  let rgb = oklchToLinear(L, C, h);
  for (let step = 0; step < 24 && !inGamut(rgb); step += 1) {
    C *= 0.92;
    rgb = oklchToLinear(L, C, h);
  }
  return `#${rgb.map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}
