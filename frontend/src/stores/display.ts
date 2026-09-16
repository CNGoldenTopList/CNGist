/**
 * 显示设置：主题、地图名语言、精简档位标签、Hist 评级、Std 挑战、Tier 配色。
 *
 * 登录后以账户偏好为准，未登录时只落在这台浏览器上。两边的键名保持不变——
 * 四十余处调用点和账户偏好都依赖 nameMode 这个三选一的形状。
 */
import { computed, ref, watch, watchEffect } from "vue";
import { defineStore, storeToRefs } from "pinia";
import { tierOrder } from "@shared/tiers";
import type { TierCode } from "@shared/types";
import { useSessionStore } from "@/stores/session";
import { darkenOklch } from "@/lib/color";

export type NameMode = "cn" | "both" | "en";
export type TierColorMap = Record<TierCode, string>;
export type ThemeMode = "dark" | "light" | "system";

/** 亮色主题下 Tier 色统一压低的 OKLCH 明度，见 lib/color.ts。 */
export const DEFAULT_LIGHT_TIER_OFFSET = 0.06;
export const MAX_LIGHT_TIER_OFFSET = 0.2;

export const DEFAULT_TIER_COLORS: TierColorMap = {
  "t-1": "#D05DE9", h0: "#F874C6", m0: "#FF97D8", l0: "#FCB5E0",
  h1: "#FF7B67", m1: "#FF9989", l1: "#FCB6AB", h2: "#FFC874",
  m2: "#FFD595", l2: "#F8DCB2", h3: "#FFEC87", m3: "#FFEBB0",
  l3: "#FBF3CF", t4: "#B0FF78", t5: "#85E191", t6: "#8FDEFF", t7: "#96A6FF",
};

export const GB_TIER_COLORS: TierColorMap = {
  "t-1": "#D85EE9", h0: "#E963CB", m0: "#ED61A3", l0: "#EF666F",
  h1: "#F17366", m1: "#F48C6B", l1: "#F5AA70", h2: "#F7C46F",
  m2: "#F5D778", l2: "#F4EB76", h3: "#EEF56F", m3: "#C9F370",
  l3: "#A6F277", t4: "#83EF7F", t5: "#7AEFAA", t6: "#75E8CA", t7: "#78DBEA",
};

// 浏览器与账户两处存储都带版本号，旧配色不会覆盖新默认值。
const KEY_COLORS = "cn-golden-tier-colors-v2";
const KEY_NAME_MODE = "cn-golden-name-mode";
const KEY_OFFICIAL = "cn-golden-official-cn-only-v2";
const KEY_COMPACT = "cn-golden-compact-tier-labels-v3";
const KEY_STANDARD = "cn-golden-show-standard-challenges-v1";
const KEY_HIST = "cn-golden-show-hist-ratings-v1";
/* 主题键名与 index.html 里防闪烁的内联脚本共用，改一处要改两处。 */
const KEY_THEME = "cn-golden-theme";
const KEY_LIGHT_OFFSET = "cn-golden-light-tier-offset-v1";

/** 7000 行旧 CSS 仍在引用的遗留变量名，必须与规范名同步写入。 */
const legacyTierVariables: Record<TierCode, string> = {
  "t-1": "--tm1", h0: "--h0", m0: "--m0", l0: "--l0",
  h1: "--h1", m1: "--m1", l1: "--l1", h2: "--h2",
  m2: "--m2", l2: "--l2", h3: "--h3", m3: "--m3",
  l3: "--l3", t4: "--t4", t5: "--t5", t6: "--t6", t7: "--t7",
};

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* 隐私模式下设置只在本页生效 */ }
}

export const useDisplayStore = defineStore("display", () => {
  const session = useSessionStore();
  const { account, ready } = storeToRefs(session);

  const savedMode = read(KEY_NAME_MODE);
  const nameMode = ref<NameMode>(
    savedMode === "cn" || savedMode === "both" || savedMode === "en" ? savedMode
      : read("cn-golden-show-cn-names") === "0" ? "en" : "both",
  );
  const onlyOfficialChinese = ref(read(KEY_OFFICIAL) === "1");
  const compactTierLabels = ref(read(KEY_COMPACT) === "1");
  const showStandardChallenges = ref(read(KEY_STANDARD) === "1");
  const showHistRatings = ref(read(KEY_HIST) === "1");
  /** 用户保存的原始配色；页面上用的是按主题偏移过的 tierColors。 */
  const tierPalette = ref<TierColorMap>(loadColors());

  const savedTheme = read(KEY_THEME);
  const themeMode = ref<ThemeMode>(savedTheme === "light" || savedTheme === "system" ? savedTheme : "dark");
  const lightTierOffset = ref(clampOffset(Number(read(KEY_LIGHT_OFFSET) ?? DEFAULT_LIGHT_TIER_OFFSET)));

  const systemQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;
  const systemLight = ref(Boolean(systemQuery?.matches));
  systemQuery?.addEventListener?.("change", (event) => { systemLight.value = event.matches; });

  const theme = computed<"dark" | "light">(() =>
    themeMode.value === "system" ? (systemLight.value ? "light" : "dark") : themeMode.value);

  const tierColors = computed<TierColorMap>(() => {
    if (theme.value === "dark" || lightTierOffset.value <= 0) return tierPalette.value;
    return Object.fromEntries(tierOrder.map((tier) =>
      [tier, darkenOklch(tierPalette.value[tier], lightTierOffset.value)])) as TierColorMap;
  });

  function loadColors(): TierColorMap {
    try {
      const saved = JSON.parse(read(KEY_COLORS) || "null") as Partial<TierColorMap> | null;
      return saved ? { ...DEFAULT_TIER_COLORS, ...saved } : { ...DEFAULT_TIER_COLORS };
    } catch {
      return { ...DEFAULT_TIER_COLORS };
    }
  }

  function clampOffset(value: number) {
    return Number.isFinite(value) ? Math.min(MAX_LIGHT_TIER_OFFSET, Math.max(0, value)) : DEFAULT_LIGHT_TIER_OFFSET;
  }

  /* 主题只存在这台浏览器上：同一个人在手机和电脑上常用不同的明暗，与网站语言同理。 */
  function setThemeMode(value: ThemeMode) {
    themeMode.value = value;
    write(KEY_THEME, value);
  }

  function setLightTierOffset(value: number) {
    lightTierOffset.value = clampOffset(value);
    write(KEY_LIGHT_OFFSET, String(lightTierOffset.value));
    session.updatePreferences({ lightTierOffset: lightTierOffset.value });
  }

  const showCn = computed(() => nameMode.value !== "en");
  const showEn = computed(() => nameMode.value !== "cn");

  function setNameMode(value: NameMode) {
    nameMode.value = value;
    write(KEY_NAME_MODE, value);
    session.updatePreferences({ nameMode: value });
  }

  /**
   * 页首那组开关是两个独立的「中」「英」，存储仍是三选一的 nameMode。
   * 关掉唯一亮着的那个 = 切到另一种语言：一个名字都不显示没有意义，
   * 与其做成点不动的死按钮，不如让它表达「我不要中文」。
   */
  function toggleNameLanguage(language: "cn" | "en") {
    const nextCn = language === "cn" ? !showCn.value : showCn.value;
    const nextEn = language === "en" ? !showEn.value : showEn.value;
    if (!nextCn && !nextEn) { setNameMode(language === "cn" ? "en" : "cn"); return; }
    setNameMode(nextCn && nextEn ? "both" : nextCn ? "cn" : "en");
  }

  const toggle = (target: typeof onlyOfficialChinese, key: string, pref: string) => (value: boolean) => {
    target.value = value;
    write(key, value ? "1" : "0");
    session.updatePreferences({ [pref]: value });
  };
  const setOnlyOfficialChinese = toggle(onlyOfficialChinese, KEY_OFFICIAL, "onlyOfficialChinese");
  const setCompactTierLabels = toggle(compactTierLabels, KEY_COMPACT, "compactTierLabels");
  const setShowStandardChallenges = toggle(showStandardChallenges, KEY_STANDARD, "showStandardChallenges");
  const setShowHistRatings = toggle(showHistRatings, KEY_HIST, "showHistRatings");

  function setTierColors(value: TierColorMap) {
    tierPalette.value = value;
    write(KEY_COLORS, JSON.stringify(value));
    session.updatePreferences({ tierColorsV2: value });
  }

  // 登录后以账户偏好为准；旧用户首次登录时把原有浏览器设置迁进账户。
  let loadedAccountId: number | null = null;
  watch([ready, account], () => {
    if (!ready.value) return;
    if (!account.value) { loadedAccountId = null; return; }
    if (loadedAccountId === account.value.id) return;
    loadedAccountId = account.value.id;
    const saved = account.value.preferences;
    if (!saved || Object.keys(saved).length === 0) {
      session.updatePreferences({
        nameMode: nameMode.value, onlyOfficialChinese: onlyOfficialChinese.value,
        compactTierLabels: compactTierLabels.value, showHistRatings: showHistRatings.value,
        showStandardChallenges: showStandardChallenges.value, tierColorsV2: tierPalette.value,
        lightTierOffset: lightTierOffset.value,
      });
      return;
    }
    if (saved.nameMode) { nameMode.value = saved.nameMode; write(KEY_NAME_MODE, saved.nameMode); }
    if (typeof saved.onlyOfficialChinese === "boolean") { onlyOfficialChinese.value = saved.onlyOfficialChinese; write(KEY_OFFICIAL, saved.onlyOfficialChinese ? "1" : "0"); }
    if (typeof saved.compactTierLabels === "boolean") { compactTierLabels.value = saved.compactTierLabels; write(KEY_COMPACT, saved.compactTierLabels ? "1" : "0"); }
    if (typeof saved.showHistRatings === "boolean") { showHistRatings.value = saved.showHistRatings; write(KEY_HIST, saved.showHistRatings ? "1" : "0"); }
    showStandardChallenges.value = saved.showStandardChallenges === true;
    write(KEY_STANDARD, saved.showStandardChallenges === true ? "1" : "0");
    if (saved.tierColorsV2) {
      const next = { ...DEFAULT_TIER_COLORS, ...saved.tierColorsV2 } as TierColorMap;
      tierPalette.value = next;
      write(KEY_COLORS, JSON.stringify(next));
    }
    if (typeof saved.lightTierOffset === "number") {
      lightTierOffset.value = clampOffset(saved.lightTierOffset);
      write(KEY_LIGHT_OFFSET, String(lightTierOffset.value));
    }
  }, { immediate: true });

  // 主题、配色与精简开关写到根元素上，CSS 与 Naive UI 的行内样式都读它。
  watchEffect(() => {
    const root = document.documentElement;
    for (const tier of tierOrder) {
      root.style.setProperty(`--tier-${tier}`, tierColors.value[tier]);
      root.style.setProperty(legacyTierVariables[tier], tierColors.value[tier]);
    }
    root.dataset.theme = theme.value;
    root.style.colorScheme = theme.value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.value === "light" ? "#fafbfc" : "#101113");
    root.dataset.compactTierLabels = compactTierLabels.value ? "true" : "false";
  });

  return {
    nameMode, showCn, showEn, onlyOfficialChinese, compactTierLabels,
    showStandardChallenges, showHistRatings, tierColors, tierPalette,
    themeMode, theme, lightTierOffset,
    setThemeMode, setLightTierOffset, setNameMode, toggleNameLanguage, setOnlyOfficialChinese, setCompactTierLabels,
    setShowStandardChallenges, setShowHistRatings, setTierColors,
  };
});
