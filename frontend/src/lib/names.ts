/**
 * 地图与地图包的显示名规则。
 *
 * 中文名只能来自正式数据或用户提供的对照，不自行翻译 —— 这里的别名兜底
 * 只挑已经写在目录里的中文别名，不做任何音译或意译。
 */
const preferredChineseAliases: Record<string, string> = {
  "poem of stars": "繁星之诗",
};

const hasChinese = (value: string) => /[㐀-鿿豈-﫿]/.test(value);

/** `[Old] Foo` 一律显示成 `Foo [Old]`：排序与扫读都靠正名开头。 */
export function displayMapName(value: string) {
  const match = value.match(/^\s*\[(?:Old)\]\s*(.+)$/i) || value.match(/^\s*\((?:Old)\)\s*(.+)$/i);
  return match ? `${match[1].trim()} [Old]` : value;
}

export function resolveChineseName(name: string, cnName?: string, aliases: string[] = [], onlyOfficialChinese = false) {
  const officialName = cnName?.trim();
  if (officialName) return officialName;

  const normalizedName = name.trim();
  if (onlyOfficialChinese || /^(SBWW|GDDH)$/i.test(normalizedName)) return undefined;

  const cleanedAliases = aliases.map((alias) => alias.trim()).filter(Boolean);
  const preferredAlias = preferredChineseAliases[normalizedName.toLowerCase()];
  if (preferredAlias) return preferredAlias;

  return cleanedAliases.find((alias) => alias !== normalizedName && hasChinese(alias));
}
