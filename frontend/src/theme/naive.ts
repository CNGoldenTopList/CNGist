/**
 * Naive UI 的配色与尺寸出口 —— 把 styles/tokens.css 的语义层原样翻译过来。
 *
 * Naive UI 会对颜色做混合运算（hover、pressed、禁用态都是算出来的），
 * 传 `var(--x)` 进去算不了，所以这里写死十六进制值。它们必须与
 * tokens.css 的同名令牌保持一致：改令牌就改这里，不要只改一边。
 */
import type { GlobalThemeOverrides } from "naive-ui";

/** 与 tokens.css 的中性阶梯逐档对应。 */
export const n = {
  50: "#f0f2f4",
  100: "#d4d6da",
  200: "#afb3b8",
  300: "#90949a",
  400: "#787c83",
  500: "#61656b",
  600: "#4d5056",
  700: "#3e4146",
  800: "#313337",
  850: "#292b2f",
  900: "#24262a",
  950: "#141517",
  1000: "#101113",
} as const;

export const accent = { 200: "#b8d2ff", 300: "#8fb7ff", 400: "#6a9cfb", 500: "#4e82e5", 600: "#3e6dc8", 700: "#2f56a8" } as const;
export const danger = { 400: "#d98a90", 500: "#bd4049", 600: "#8f2f37" } as const;
export const ok = { 400: "#7fc9a0", 600: "#2f7d52" } as const;
export const brandMark = "#e6c47b";

const fontBody =
  '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const fontMono = '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace';

/* 控件高度沿用 --ctl-sm / --ctl-md / --ctl-lg，圆角沿用 --r-sm / --r-md。 */
const common = {
  fontFamily: fontBody,
  fontFamilyMono: fontMono,
  fontSize: "0.875rem",
  fontSizeMini: "0.6875rem",
  fontSizeTiny: "0.6875rem",
  fontSizeSmall: "0.75rem",
  fontSizeMedium: "0.875rem",
  fontSizeLarge: "1rem",
  fontSizeHuge: "1.1875rem",
  fontWeight: "400",
  fontWeightStrong: "600",
  lineHeight: "1.45",

  borderRadius: "10px",
  borderRadiusSmall: "6px",

  heightMini: "24px",
  heightTiny: "28px",
  heightSmall: "28px",
  heightMedium: "34px",
  heightLarge: "42px",
  heightHuge: "48px",

  primaryColor: accent[600],
  primaryColorHover: accent[500],
  primaryColorPressed: accent[700],
  primaryColorSuppl: accent[500],

  infoColor: accent[500],
  infoColorHover: accent[400],
  infoColorPressed: accent[600],
  infoColorSuppl: accent[400],

  successColor: ok[600],
  successColorHover: "#38946126",
  successColorPressed: "#256640",
  successColorSuppl: ok[400],

  warningColor: brandMark,
  warningColorHover: "#efd39a",
  warningColorPressed: "#cfa855",
  warningColorSuppl: brandMark,

  errorColor: danger[500],
  errorColorHover: "#cb5b63",
  errorColorPressed: danger[600],
  errorColorSuppl: danger[400],

  textColorBase: n[50],
  textColor1: n[50],
  textColor2: n[100],
  textColor3: n[200],
  textColorDisabled: n[400],
  placeholderColor: n[300],
  placeholderColorDisabled: n[400],
  iconColor: n[200],
  iconColorHover: n[100],
  iconColorPressed: n[50],
  iconColorDisabled: n[400],

  /* 分区靠地面色差和 1px 细线，不靠阴影；只有浮层需要真正的投影。 */
  dividerColor: n[800],
  borderColor: n[700],

  closeIconColor: n[200],
  closeIconColorHover: n[50],
  closeIconColorPressed: n[50],
  closeColorHover: "#ffffff14",
  closeColorPressed: "#ffffff1f",

  baseColor: n[1000],
  bodyColor: n[1000],
  cardColor: n[900],
  modalColor: n[900],
  popoverColor: n[850],
  tableColor: n[900],
  tableHeaderColor: n[950],
  inputColor: n[950],
  inputColorDisabled: n[900],
  actionColor: n[950],
  tagColor: n[850],
  avatarColor: n[800],
  invertedColor: n[950],
  codeColor: n[950],
  scrollbarColor: "#4d5056",
  scrollbarColorHover: "#90949a",
  railColor: n[800],
  progressRailColor: n[800],

  hoverColor: "#ffffff0d",
  pressedColor: "#ffffff14",
  opacityDisabled: "0.45",

  boxShadow1: "0 2px 8px #00000059",
  boxShadow2: "0 8px 24px #00000073",
  boxShadow3: "0 16px 40px #00000080",
} as const;

export const naiveTheme: GlobalThemeOverrides = {
  common,

  Button: {
    /* 次要按钮保持描边形态：选中态只改描边与文字，不改填充（令牌硬约束 3）。 */
    textColor: n[100],
    textColorHover: n[50],
    textColorPressed: n[50],
    textColorFocus: n[50],
    border: `1px solid ${n[700]}`,
    borderHover: `1px solid ${n[600]}`,
    borderPressed: `1px solid ${n[600]}`,
    borderFocus: `1px solid ${accent[400]}`,
    color: n[850],
    colorHover: n[800],
    colorPressed: n[800],
    colorFocus: n[850],
    textColorPrimary: "#ffffff",
    textColorGhostPrimary: accent[400],
    fontWeight: "600",
    fontSizeTiny: "0.75rem",
    fontSizeSmall: "0.75rem",
    fontSizeMedium: "0.875rem",
    paddingMedium: "0 14px",
    paddingSmall: "0 10px",
    paddingTiny: "0 8px",
  },

  Input: {
    color: n[950],
    colorFocus: n[950],
    border: `1px solid ${n[700]}`,
    borderHover: `1px solid ${n[600]}`,
    borderFocus: `1px solid ${accent[400]}`,
    boxShadowFocus: `0 0 0 2px ${accent[600]}40`,
    caretColor: accent[400],
    borderRadius: "6px",
  },
  InternalSelection: {
    color: n[950],
    colorActive: n[950],
    border: `1px solid ${n[700]}`,
    borderHover: `1px solid ${n[600]}`,
    borderActive: `1px solid ${accent[400]}`,
    borderFocus: `1px solid ${accent[400]}`,
    boxShadowActive: `0 0 0 2px ${accent[600]}40`,
    boxShadowFocus: `0 0 0 2px ${accent[600]}40`,
    borderRadius: "6px",
  },
  InternalSelectMenu: {
    /* 下拉一律深色自绘，不使用浏览器原生列表（令牌硬约束 7）。 */
    color: n[850],
    optionTextColor: n[100],
    optionTextColorActive: n[50],
    optionTextColorPressed: n[50],
    optionCheckColor: accent[400],
    optionColorPending: "#ffffff0d",
    optionColorActive: "#ffffff14",
    optionColorActivePending: "#ffffff1f",
    borderRadius: "10px",
  },
  Dropdown: { color: n[850], optionColorHover: "#ffffff0d", optionTextColor: n[100], optionTextColorHover: n[50], borderRadius: "10px" },
  Popover: { color: n[850], textColor: n[100], borderRadius: "10px", padding: "10px 12px" },
  Tooltip: { color: n[800], textColor: n[50], borderRadius: "6px" },

  Card: {
    /* 容器不再有边框：分区手段是地面色差 + 1px 细线 + 留白。 */
    color: n[900],
    colorModal: n[900],
    borderColor: n[800],
    borderRadius: "10px",
    titleFontWeight: "600",
    titleTextColor: n[50],
    textColor: n[100],
    paddingMedium: "16px 20px",
    actionColor: n[950],
  },
  Modal: { color: n[900] },
  Dialog: { color: n[900], titleTextColor: n[50], textColor: n[100], borderRadius: "10px", closeIconColor: n[200] },
  Drawer: { color: n[950], textColor: n[100] },

  DataTable: {
    thColor: n[950],
    thTextColor: n[200],
    thFontWeight: "600",
    tdColor: n[900],
    tdColorHover: n[850],
    tdColorStriped: n[950],
    borderColor: n[800],
    tdTextColor: n[100],
    borderRadius: "10px",
    thPaddingMedium: "8px 12px",
    tdPaddingMedium: "8px 12px",
    lineHeight: "1.45",
  },

  Tabs: {
    tabTextColorLine: n[200],
    tabTextColorActiveLine: n[50],
    tabTextColorHoverLine: n[50],
    tabTextColorBar: n[200],
    tabTextColorActiveBar: n[50],
    /* 分段控件：底槽压到最深一档当凹面，选中块抬到 n[850] 当凸面。
       两者必须差出一档明度 —— 只靠字重表示「选中」在暗色地面上读不出来。 */
    colorSegment: n[1000],
    tabTextColorSegment: n[200],
    tabTextColorActiveSegment: n[50],
    tabTextColorHoverSegment: n[50],
    tabColorSegment: n[850],
    barColor: accent[400],
    tabFontWeightActive: "600",
    tabBorderColor: n[800],
    paneTextColor: n[100],
  },

  Tag: { color: n[850], textColor: n[100], border: `1px solid ${n[700]}`, borderRadius: "6px", heightSmall: "20px", fontSizeSmall: "0.6875rem" },
  Alert: { titleTextColor: n[50], contentTextColor: n[100], borderRadius: "10px" },
  Message: { color: n[850], textColor: n[50], boxShadow: "0 8px 24px #00000073", borderRadius: "10px" },
  Notification: { color: n[850], textColor: n[100], headerTextColor: n[50], borderRadius: "10px" },

  Switch: { railColor: n[700], railColorActive: accent[600], buttonColor: n[50] },
  Radio: { buttonColor: n[950], buttonColorActive: accent[600], buttonTextColor: n[200], buttonTextColorActive: "#ffffff", buttonBorderColor: n[700], buttonBorderColorActive: accent[600], boxShadowFocus: `0 0 0 2px ${accent[600]}40` },
  Checkbox: { colorChecked: accent[600], border: `1px solid ${n[600]}`, borderChecked: `1px solid ${accent[600]}`, checkMarkColor: "#ffffff", borderRadius: "4px" },
  Slider: { railColor: n[800], fillColor: accent[600], fillColorHover: accent[500], handleColor: n[50], indicatorColor: n[800], indicatorTextColor: n[50] },
  Pagination: { itemTextColor: n[200], itemTextColorHover: n[50], itemTextColorActive: "#ffffff", itemColorActive: accent[600], itemColorActiveHover: accent[500], itemBorder: `1px solid ${n[700]}`, itemBorderActive: `1px solid ${accent[600]}`, itemBorderRadius: "6px" },
  Skeleton: { color: n[850], colorEnd: n[800] },
  Spin: { color: accent[400] },
  Empty: { textColor: n[300], iconColor: n[500] },
  Divider: { color: n[800] },
  Collapse: { titleTextColor: n[50], textColor: n[100], dividerColor: n[800], titleFontWeight: "600" },
  Descriptions: { thColor: n[950], tdColor: n[900], borderColor: n[800], thTextColor: n[200], tdTextColor: n[100] },
  Progress: { railColor: n[800] },
  Result: { titleTextColor: n[50], textColor: n[200] },
  Statistic: { labelTextColor: n[200], valueTextColor: n[50], valueFontSize: "1.5rem" },
  Upload: { draggerColor: n[950], draggerBorder: `1px dashed ${n[700]}`, draggerBorderHover: `1px dashed ${accent[400]}`, itemColorHover: "#ffffff0d" },
  Anchor: { railColor: n[800], linkTextColor: n[200], linkTextColorHover: n[50], linkTextColorActive: accent[400] },
  Breadcrumb: { itemTextColor: n[200], itemTextColorHover: n[50], itemTextColorActive: n[50], separatorColor: n[500] },
  Scrollbar: { color: n[600], colorHover: n[300] },
};
