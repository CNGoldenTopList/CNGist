/** 北京时间输入、存储与展示格式转换。 */
const BEIJING_ZONE = "Asia/Shanghai";

function parts(date: Date) {
  const values = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => values.find((item) => item.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function parseStored(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)
    ? `${value.replace(" ", "T")}${value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value) ? "" : "+08:00"}`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function beijingNow() { return parts(new Date()); }
export function beijingDate() { return beijingNow().slice(0, 10); }
export function beijingInputNow() { return beijingNow().slice(0, 16).replace(" ", "T"); }
export function toBeijingStorage(value: string) { return value.trim().replace("T", " "); }
export function toDateTimeInput(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
  const parsed = parseStored(value);
  return (parsed ? parts(parsed) : value.replace("T", " ")).slice(0, 16).replace(" ", "T");
}
export function formatBeijingDateTime(value?: string, includeSeconds = false, fallback = "未记录") {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseStored(value);
  const formatted = parsed ? parts(parsed) : value.replace("T", " ").replace(/Z$/, "");
  return includeSeconds ? formatted : formatted.slice(0, 16);
}

/** 英文用 en-CA 的 2024-05-03，中文保留 2024/05/03 —— 两种都无歧义。 */
export const formatDate = (value: string, locale: "zh-CN" | "en" = "zh-CN") => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};
