/** 中文、拼音、首字母与混合文本搜索逻辑。 */
import { pinyin } from "pinyin-pro";

export function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[\s·•._()（）\-—–/\\]+/g, "").trim();
}

function implicitPinyin(value: string) {
  if (!/[\u3400-\u9fff]/.test(value)) return [];
  try {
    const full = pinyin(value, { toneType: "none", type: "array" }).join("");
    const initials = pinyin(value, { toneType: "none", pattern: "first", type: "array" }).join("");
    return [full, initials];
  } catch {
    return [];
  }
}

export function searchable(values: Array<string | undefined>, aliases: string[] | undefined, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;
  // Mixed Chinese/pinyin queries need the same expansion as indexed names.
  // Keep Chinese-only queries literal, so homophones do not broaden their results.
  const queries = /[\u3400-\u9fff]/.test(q) && /[a-z]/.test(q)
    ? [q, ...implicitPinyin(q).map(normalizeSearch)]
    : [q];
  return [...values.filter(Boolean) as string[], ...(aliases ?? [])].some((value) =>
    [value, ...implicitPinyin(value)].some((candidate) => queries.some((query) => normalizeSearch(candidate).includes(query))),
  );
}
