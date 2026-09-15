import type { DifficultyCode, RatedTier, StandardTier, TierCode } from "./types";

/** 难度从难到易排列。 */
export const tierOrder: TierCode[] = [
  "t-1",
  "h0", "m0", "l0",
  "h1", "m1", "l1",
  "h2", "m2", "l2",
  "h3", "m3", "l3",
  "t4", "t5", "t6", "t7"
];

export const tierMeta: Record<TierCode, {
  label: string;
  short: string;
  group: string;
  level: number;
  sub: number;
  className: string;
}> = {
  "t-1": { label: "Tier -1", short: "T-1", group: "Tier -1", level: -1, sub: 0, className: "tc-tm1" },
  h0: { label: "High Tier 0", short: "High T0", group: "Tier 0", level: 0, sub: 0, className: "tc-h0" },
  m0: { label: "Mid Tier 0", short: "Mid T0", group: "Tier 0", level: 0, sub: 1, className: "tc-m0" },
  l0: { label: "Low Tier 0", short: "Low T0", group: "Tier 0", level: 0, sub: 2, className: "tc-l0" },
  h1: { label: "High Tier 1", short: "High T1", group: "Tier 1", level: 1, sub: 0, className: "tc-h1" },
  m1: { label: "Mid Tier 1", short: "Mid T1", group: "Tier 1", level: 1, sub: 1, className: "tc-m1" },
  l1: { label: "Low Tier 1", short: "Low T1", group: "Tier 1", level: 1, sub: 2, className: "tc-l1" },
  h2: { label: "High Tier 2", short: "High T2", group: "Tier 2", level: 2, sub: 0, className: "tc-h2" },
  m2: { label: "Mid Tier 2", short: "Mid T2", group: "Tier 2", level: 2, sub: 1, className: "tc-m2" },
  l2: { label: "Low Tier 2", short: "Low T2", group: "Tier 2", level: 2, sub: 2, className: "tc-l2" },
  h3: { label: "High Tier 3", short: "High T3", group: "Tier 3", level: 3, sub: 0, className: "tc-h3" },
  m3: { label: "Mid Tier 3", short: "Mid T3", group: "Tier 3", level: 3, sub: 1, className: "tc-m3" },
  l3: { label: "Low Tier 3", short: "Low T3", group: "Tier 3", level: 3, sub: 2, className: "tc-l3" },
  t4: { label: "Tier 4", short: "T4", group: "Tier 4", level: 4, sub: 0, className: "tc-t4" },
  t5: { label: "Tier 5", short: "T5", group: "Tier 5", level: 5, sub: 0, className: "tc-t5" },
  t6: { label: "Tier 6", short: "T6", group: "Tier 6", level: 6, sub: 0, className: "tc-t6" },
  t7: { label: "Tier 7", short: "T7", group: "Tier 7", level: 7, sub: 0, className: "tc-t7" }
};

export const tierGroups = ["Tier -1", "Tier 0", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5", "Tier 6", "Tier 7"];

export const standardOrder: StandardTier[] = ["high-std", "mid-std", "low-std"];
export const standardMeta: Record<StandardTier, { label: string; color: string }> = {
  "high-std": { label: "High Std", color: "#d4d4d4" },
  "mid-std": { label: "Mid Std", color: "#adadad" },
  "low-std": { label: "Low Std", color: "#868686" },
};
export const ratedTierOrder: RatedTier[] = [...tierOrder, ...standardOrder];
export const isTierCode = (code: string | null | undefined): code is TierCode => Boolean(code && Object.hasOwn(tierMeta, code));
export const isStandardTier = (code: string | null | undefined): code is StandardTier => Boolean(code && Object.hasOwn(standardMeta, code));
export const isRatedTier = (code: string | null | undefined): code is RatedTier => isTierCode(code) || isStandardTier(code);
export const isDifficultyCode = (code: string | null | undefined): code is DifficultyCode => code === "undetermined" || isRatedTier(code);
export const tierIndex = (code: DifficultyCode) => code === "undetermined" ? ratedTierOrder.length : ratedTierOrder.indexOf(code);
export const ratedTierColor = (code: RatedTier, colors: Record<TierCode, string>) => isStandardTier(code) ? standardMeta[code].color : colors[code];
export const tierLabel = (code: TierCode) => tierMeta[code].label;
export const tierBadgeLabel = (code: RatedTier) => isStandardTier(code) ? standardMeta[code].label : tierMeta[code].label.replace(/^(High|Mid|Low) Tier /, "$1 T");

/** 展示用的档位名，compact 跟随「精简档位标签」显示设置。 */
export const tierDisplayLabel = (code: TierCode, compact: boolean) =>
  compact ? tierMeta[code].short : tierBadgeLabel(code);

export const hardestTier = (codes: TierCode[]) =>
  [...codes].sort((a, b) => tierIndex(a) - tierIndex(b))[0] ?? "t7";
