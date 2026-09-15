import { translate, type Locale } from "./i18n/format";

export type HistItem = { id: number; name: string; stars: number; subTier: "upper" | "lower" | null; publishUrl?: string };
/** 星级文案。规则与 CNHist 自己的渲染保持一致： */
export function histLabel(item: Pick<HistItem, "stars" | "subTier">, locale: Locale = "zh-CN") {
  if (!item.stars) return translate(locale, "hist.pending");
  return translate(locale, item.subTier === "lower" ? "hist.lower" : "hist.upper", { stars: item.stars });
}

/** 地图级编辑值：null 表示无评级，0 表示未定档。 */
export function parseMapHist(value: unknown): { histStars: number | null; histSubTier: "lower" | "upper" | null } | undefined {
  if (value === "none") return { histStars: null, histSubTier: null };
  if (value === "pending") return { histStars: 0, histSubTier: null };
  if (typeof value !== "string") return undefined;
  const match = /^([1-5])-(lower|upper)$/.exec(value);
  return match ? { histStars: Number(match[1]), histSubTier: match[2] as "lower" | "upper" } : undefined;
}

export function mapHistValue(map: { histStars?: number | null; histSubTier?: string | null }) {
  if (map.histStars == null) return "none";
  return map.histStars === 0 ? "pending" : `${map.histStars}-${map.histSubTier}`;
}
