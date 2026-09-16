/**
 * Naive UI 的配色与尺寸出口 —— 把 styles/tokens.css 的语义层原样翻译过来。
 *
 * Naive UI 会对颜色做混合运算（hover、pressed、禁用态都是算出来的），
 * 传 `var(--x)` 进去算不了，所以这里写死十六进制值。它们必须与
 * tokens.css 的同名令牌保持一致：改令牌就改这里，不要只改一边。
 *
 * 深浅两套共用同一份结构：亮色主题的中性阶梯是翻转过的（n[50] 仍是最强前景，
 * n[1000] 仍是页面地面），所以下面的映射对两套主题都成立。
 */
import type { GlobalThemeOverrides } from "naive-ui";

type Ladder<K extends number> = Record<K, string>;
type Palette = {
  n: Ladder<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950 | 1000>;
  accent: Ladder<200 | 300 | 400 | 500 | 600 | 700>;
  danger: Ladder<400 | 500 | 600>;
  ok: Ladder<400 | 600>;
  brandMark: string;
  warningHover: string;
  warningPressed: string;
  /** 叠在任意地面上的悬停 / 按下蒙层 */
  hover: string;
  pressed: string;
  pressedStrong: string;
  /** 浮层地面：深色抬一档，亮色直接用白色靠投影分层 */
  popover: string;
  /** 滑块手柄：两套主题都是浅色圆点 */
  handle: string;
  shadow: Ladder<1 | 2 | 3>;
};

/** 与 tokens.css 的 :root 逐档对应。 */
const darkPalette: Palette = {
  n: {
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
  },
  accent: { 200: "#b8d2ff", 300: "#8fb7ff", 400: "#6a9cfb", 500: "#4e82e5", 600: "#3e6dc8", 700: "#2f56a8" },
  danger: { 400: "#d98a90", 500: "#bd4049", 600: "#8f2f37" },
  ok: { 400: "#7fc9a0", 600: "#2f7d52" },
  brandMark: "#e6c47b",
  warningHover: "#efd39a",
  warningPressed: "#cfa855",
  hover: "#ffffff0d",
  pressed: "#ffffff14",
  pressedStrong: "#ffffff1f",
  popover: "#292b2f",
  handle: "#f0f2f4",
  shadow: { 1: "0 2px 8px #00000059", 2: "0 8px 24px #00000073", 3: "0 16px 40px #00000080" },
};

/** 与 tokens.css 的 :root[data-theme="light"] 逐档对应。 */
const lightPalette: Palette = {
  n: {
    50: "#2a2e35",
    100: "#3f444c",
    200: "#585d66",
    300: "#6a6f78",
    400: "#8b9098",
    500: "#a3a7ae",
    600: "#bcc0c6",
    700: "#d3d6db",
    800: "#e3e5e9",
    850: "#eef0f2",
    900: "#ffffff",
    950: "#fafbfc",
    1000: "#f3f4f6",
  },
  accent: { 200: "#1c3f87", 300: "#234ea6", 400: "#2f62c9", 500: "#3a6dd2", 600: "#3e6dc8", 700: "#2f56a8" },
  danger: { 400: "#b3363f", 500: "#bd4049", 600: "#a3353e" },
  ok: { 400: "#22774a", 600: "#2f7d52" },
  brandMark: "#9a6a12",
  warningHover: "#b07d1f",
  warningPressed: "#80570d",
  hover: "#1a1d2208",
  pressed: "#1a1d2210",
  pressedStrong: "#1a1d2218",
  popover: "#ffffff",
  handle: "#ffffff",
  shadow: { 1: "0 2px 8px #1a1d221a", 2: "0 8px 24px #1a1d2224", 3: "0 16px 40px #1a1d222e" },
};

const fontBody =
  '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const fontMono = '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace';

/* 控件高度沿用 --ctl-sm / --ctl-md / --ctl-lg，圆角沿用 --r-sm / --r-md。 */
const buildCommon = (p: Palette) => ({
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

  primaryColor: p.accent[600],
  primaryColorHover: p.accent[500],
  primaryColorPressed: p.accent[700],
  primaryColorSuppl: p.accent[500],

  infoColor: p.accent[500],
  infoColorHover: p.accent[400],
  infoColorPressed: p.accent[600],
  infoColorSuppl: p.accent[400],

  successColor: p.ok[600],
  successColorHover: "#38946126",
  successColorPressed: "#256640",
  successColorSuppl: p.ok[400],

  warningColor: p.brandMark,
  warningColorHover: p.warningHover,
  warningColorPressed: p.warningPressed,
  warningColorSuppl: p.brandMark,

  errorColor: p.danger[500],
  errorColorHover: "#cb5b63",
  errorColorPressed: p.danger[600],
  errorColorSuppl: p.danger[400],

  textColorBase: p.n[50],
  textColor1: p.n[50],
  textColor2: p.n[100],
  textColor3: p.n[200],
  textColorDisabled: p.n[400],
  placeholderColor: p.n[300],
  placeholderColorDisabled: p.n[400],
  iconColor: p.n[200],
  iconColorHover: p.n[100],
  iconColorPressed: p.n[50],
  iconColorDisabled: p.n[400],

  /* 分区靠地面色差和 1px 细线，不靠阴影；只有浮层需要真正的投影。 */
  dividerColor: p.n[800],
  borderColor: p.n[700],

  closeIconColor: p.n[200],
  closeIconColorHover: p.n[50],
  closeIconColorPressed: p.n[50],
  closeColorHover: p.pressed,
  closeColorPressed: p.pressedStrong,

  baseColor: p.n[1000],
  bodyColor: p.n[1000],
  cardColor: p.n[900],
  modalColor: p.n[900],
  popoverColor: p.popover,
  tableColor: p.n[900],
  tableHeaderColor: p.n[950],
  inputColor: p.n[950],
  inputColorDisabled: p.n[900],
  actionColor: p.n[950],
  tagColor: p.n[850],
  avatarColor: p.n[800],
  invertedColor: p.n[950],
  codeColor: p.n[950],
  scrollbarColor: p.n[600],
  scrollbarColorHover: p.n[300],
  railColor: p.n[800],
  progressRailColor: p.n[800],

  hoverColor: p.hover,
  pressedColor: p.pressed,
  opacityDisabled: "0.45",

  boxShadow1: p.shadow[1],
  boxShadow2: p.shadow[2],
  boxShadow3: p.shadow[3],
});

const buildTheme = (p: Palette): GlobalThemeOverrides => ({
  common: buildCommon(p),

  Button: {
    /* 次要按钮保持描边形态：选中态只改描边与文字，不改填充（令牌硬约束 3）。 */
    textColor: p.n[100],
    textColorHover: p.n[50],
    textColorPressed: p.n[50],
    textColorFocus: p.n[50],
    border: `1px solid ${p.n[700]}`,
    borderHover: `1px solid ${p.n[600]}`,
    borderPressed: `1px solid ${p.n[600]}`,
    borderFocus: `1px solid ${p.accent[400]}`,
    color: p.n[850],
    colorHover: p.n[800],
    colorPressed: p.n[800],
    colorFocus: p.n[850],
    textColorPrimary: "#ffffff",
    textColorGhostPrimary: p.accent[400],
    fontWeight: "600",
    fontSizeTiny: "0.75rem",
    fontSizeSmall: "0.75rem",
    fontSizeMedium: "0.875rem",
    paddingMedium: "0 14px",
    paddingSmall: "0 10px",
    paddingTiny: "0 8px",
  },

  Input: {
    color: p.n[950],
    colorFocus: p.n[950],
    border: `1px solid ${p.n[700]}`,
    borderHover: `1px solid ${p.n[600]}`,
    borderFocus: `1px solid ${p.accent[400]}`,
    boxShadowFocus: `0 0 0 2px ${p.accent[600]}40`,
    caretColor: p.accent[400],
    borderRadius: "6px",
  },
  InternalSelection: {
    color: p.n[950],
    colorActive: p.n[950],
    border: `1px solid ${p.n[700]}`,
    borderHover: `1px solid ${p.n[600]}`,
    borderActive: `1px solid ${p.accent[400]}`,
    borderFocus: `1px solid ${p.accent[400]}`,
    boxShadowActive: `0 0 0 2px ${p.accent[600]}40`,
    boxShadowFocus: `0 0 0 2px ${p.accent[600]}40`,
    borderRadius: "6px",
  },
  InternalSelectMenu: {
    /* 下拉一律深色自绘，不使用浏览器原生列表（令牌硬约束 7）。 */
    color: p.popover,
    optionTextColor: p.n[100],
    optionTextColorActive: p.n[50],
    optionTextColorPressed: p.n[50],
    optionCheckColor: p.accent[400],
    optionColorPending: p.hover,
    optionColorActive: p.pressed,
    optionColorActivePending: p.pressedStrong,
    borderRadius: "10px",
  },
  Dropdown: { color: p.popover, optionColorHover: p.hover, optionTextColor: p.n[100], optionTextColorHover: p.n[50], borderRadius: "10px" },
  Popover: { color: p.popover, textColor: p.n[100], borderRadius: "10px", padding: "10px 12px" },
  Tooltip: { color: p.n[800], textColor: p.n[50], borderRadius: "6px" },

  Card: {
    /* 容器不再有边框：分区手段是地面色差 + 1px 细线 + 留白。 */
    color: p.n[900],
    colorModal: p.n[900],
    borderColor: p.n[800],
    borderRadius: "10px",
    titleFontWeight: "600",
    titleTextColor: p.n[50],
    textColor: p.n[100],
    paddingMedium: "16px 20px",
    actionColor: p.n[950],
  },
  Modal: { color: p.n[900] },
  Dialog: { color: p.n[900], titleTextColor: p.n[50], textColor: p.n[100], borderRadius: "10px", closeIconColor: p.n[200] },
  Drawer: { color: p.n[950], textColor: p.n[100] },

  DataTable: {
    thColor: p.n[950],
    thTextColor: p.n[200],
    thFontWeight: "600",
    tdColor: p.n[900],
    tdColorHover: p.n[850],
    tdColorStriped: p.n[950],
    borderColor: p.n[800],
    tdTextColor: p.n[100],
    borderRadius: "10px",
    thPaddingMedium: "8px 12px",
    tdPaddingMedium: "8px 12px",
    lineHeight: "1.45",
  },

  Tabs: {
    tabTextColorLine: p.n[200],
    tabTextColorActiveLine: p.n[50],
    tabTextColorHoverLine: p.n[50],
    tabTextColorBar: p.n[200],
    tabTextColorActiveBar: p.n[50],
    /* 分段控件：底槽压到最深一档当凹面，选中块抬到 p.n[850] 当凸面。
       两者必须差出一档明度 —— 只靠字重表示「选中」在暗色地面上读不出来。 */
    colorSegment: p.n[1000],
    tabTextColorSegment: p.n[200],
    tabTextColorActiveSegment: p.n[50],
    tabTextColorHoverSegment: p.n[50],
    tabColorSegment: p.n[850],
    barColor: p.accent[400],
    tabFontWeightActive: "600",
    tabBorderColor: p.n[800],
    paneTextColor: p.n[100],
  },

  Tag: { color: p.n[850], textColor: p.n[100], border: `1px solid ${p.n[700]}`, borderRadius: "6px", heightSmall: "20px", fontSizeSmall: "0.6875rem" },
  Alert: { titleTextColor: p.n[50], contentTextColor: p.n[100], borderRadius: "10px" },
  Message: { color: p.popover, textColor: p.n[50], boxShadow: p.shadow[2], borderRadius: "10px" },
  Notification: { color: p.popover, textColor: p.n[100], headerTextColor: p.n[50], borderRadius: "10px" },

  Switch: { railColor: p.n[700], railColorActive: p.accent[600], buttonColor: "#ffffff" },
  Radio: { buttonColor: p.n[950], buttonColorActive: p.accent[600], buttonTextColor: p.n[200], buttonTextColorActive: "#ffffff", buttonBorderColor: p.n[700], buttonBorderColorActive: p.accent[600], boxShadowFocus: `0 0 0 2px ${p.accent[600]}40` },
  Checkbox: { colorChecked: p.accent[600], border: `1px solid ${p.n[600]}`, borderChecked: `1px solid ${p.accent[600]}`, checkMarkColor: "#ffffff", borderRadius: "4px" },
  Slider: { railColor: p.n[800], fillColor: p.accent[600], fillColorHover: p.accent[500], handleColor: p.handle, indicatorColor: p.n[800], indicatorTextColor: p.n[50] },
  Pagination: { itemTextColor: p.n[200], itemTextColorHover: p.n[50], itemTextColorActive: "#ffffff", itemColorActive: p.accent[600], itemColorActiveHover: p.accent[500], itemBorder: `1px solid ${p.n[700]}`, itemBorderActive: `1px solid ${p.accent[600]}`, itemBorderRadius: "6px" },
  Skeleton: { color: p.n[850], colorEnd: p.n[800] },
  Spin: { color: p.accent[400] },
  Empty: { textColor: p.n[300], iconColor: p.n[500] },
  Divider: { color: p.n[800] },
  Collapse: { titleTextColor: p.n[50], textColor: p.n[100], dividerColor: p.n[800], titleFontWeight: "600" },
  Descriptions: { thColor: p.n[950], tdColor: p.n[900], borderColor: p.n[800], thTextColor: p.n[200], tdTextColor: p.n[100] },
  Progress: { railColor: p.n[800] },
  Result: { titleTextColor: p.n[50], textColor: p.n[200] },
  Statistic: { labelTextColor: p.n[200], valueTextColor: p.n[50], valueFontSize: "1.5rem" },
  Upload: { draggerColor: p.n[950], draggerBorder: `1px dashed ${p.n[700]}`, draggerBorderHover: `1px dashed ${p.accent[400]}`, itemColorHover: p.hover },
  Anchor: { railColor: p.n[800], linkTextColor: p.n[200], linkTextColorHover: p.n[50], linkTextColorActive: p.accent[400] },
  Breadcrumb: { itemTextColor: p.n[200], itemTextColorHover: p.n[50], itemTextColorActive: p.n[50], separatorColor: p.n[500] },
  Scrollbar: { color: p.n[600], colorHover: p.n[300] },
});

export const naiveThemes = { dark: buildTheme(darkPalette), light: buildTheme(lightPalette) } as const;
