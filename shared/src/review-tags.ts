/** 审核标签的同一性、固定配色与预设词表。**不要 import 任何客户端模块** —— */
export const FC_TAG_COLOR = "#4ecf98";           /* --mark-moon */
export const DTS_TAG_COLOR = "#f77fe0";          /* --mark-dts  */
export const NO_MAJOR_SKIPS_TAG_COLOR = "#afb3b8"; /* --fg-muted：限定不占色相 */

/** 标签同一性：FC / 月莓 / moon 是同一个标签，其余按去空格、大小写不敏感的文本比。 */
export function tagIdentity(value: string) {
  return /^(FC|月莓|moon)$/i.test(value.trim()) ? "fc" : value.trim().toLocaleLowerCase();
}

/** 语义固定的标签不允许调用方自选颜色，否则同一个 FC 从不同入口加进来会 */
export function fixedTagColor(value: string) {
  const text = value.trim();
  if (/^(FC|月莓|moon)$/i.test(text)) return FC_TAG_COLOR;
  if (/^DTS$/i.test(text)) return DTS_TAG_COLOR;
  if (/^No Major Skips$/i.test(text)) return NO_MAJOR_SKIPS_TAG_COLOR;
  return undefined;
}

/** 调色板放开成任意颜色后，写进库的仍必须是 `#rrggbb`：这个值会被原样塞进 */
export function normalizeTagColor(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(text);
  if (short) return `#${[...short[1]].map((digit) => digit + digit).join("")}`;
  return /^#[0-9a-f]{6}$/.test(text) ? text : undefined;
}

/** 预设标签 —— 后台加标签的快捷入口，也是这批文字的**唯一权威写法**。 */
export const PRESET_BADGE_TAGS: Array<{ text: string; color: string }> = [
  /* 前三个的 color 只是让预设按钮显示对颜色，真正说了算的是 fixedTagColor；
     All Major Secrets 不在固定色之列，这里是默认值，管理员可以改。 */
  { text: "FC", color: FC_TAG_COLOR },
  { text: "DTS", color: DTS_TAG_COLOR },
  { text: "No Major Skips", color: NO_MAJOR_SKIPS_TAG_COLOR },
  { text: "All Major Secrets", color: "#67c9ff" },
];

export const PRESET_NOTE_TAGS = [
  "隐藏银草莓",
  "隐藏金草莓",
  "使用速度计",
  "使用体力条",
  "使用 Input History 显示帧数",
  "使用 better ice walls",
  "使用 better moving blocks",
];
