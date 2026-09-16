<script setup lang="ts">
/**
 * 显示设置。网站语言、主题、四个显示开关、17 档 Tier 配色与亮色偏移。
 *
 * 配色先改草稿再保存：调色板是 17 个联动的值，边拖边写库会把每一帧
 * 都发出去。预设按钮是例外——点「默认配色」就是要立刻看到效果。
 */
import { computed, ref, watch } from "vue";
import { NButton, NCheckbox, NColorPicker, NModal, NRadioButton, NRadioGroup, NSlider } from "naive-ui";
import { storeToRefs } from "pinia";
import { tierMeta, tierOrder } from "@shared/tiers";
import type { TierCode } from "@shared/types";
import { useLanguage, type MessageKey } from "@/i18n";
import {
  DEFAULT_LIGHT_TIER_OFFSET, DEFAULT_TIER_COLORS, GB_TIER_COLORS, MAX_LIGHT_TIER_OFFSET,
  useDisplayStore, type ThemeMode, type TierColorMap,
} from "@/stores/display";

const show = defineModel<boolean>("show", { required: true });
const { t, locale, setLocale } = useLanguage();
const display = useDisplayStore();
const {
  compactTierLabels, onlyOfficialChinese, showHistRatings, showStandardChallenges, tierPalette,
  themeMode, theme, lightTierOffset,
} = storeToRefs(display);

const draft = ref<TierColorMap>({ ...tierPalette.value });
const notice = ref<MessageKey | "">("");

watch(show, (open) => {
  if (!open) return;
  draft.value = { ...tierPalette.value };
  notice.value = "";
});

const dirty = computed(() => tierOrder.some((tier) => draft.value[tier] !== tierPalette.value[tier]));

const themeOptions = computed<Array<{ value: ThemeMode; label: string }>>(() => [
  { value: "dark", label: t("settings.themeDark") },
  { value: "light", label: t("settings.themeLight") },
  { value: "system", label: t("settings.themeSystem") },
]);

/* 偏移量内部是 OKLCH 明度（0–0.2），界面上按百分点展示更直观。 */
const offsetPercent = computed({
  get: () => Math.round(lightTierOffset.value * 100),
  set: (value: number) => display.setLightTierOffset(value / 100),
});

const languageOptions = computed(() => [
  { value: "zh-CN", label: t("settings.chinese") },
  { value: "en", label: t("settings.english") },
]);

const checks = computed(() => [
  { value: compactTierLabels.value, set: display.setCompactTierLabels, label: t("settings.compact") },
  { value: onlyOfficialChinese.value, set: display.setOnlyOfficialChinese, label: t("settings.official") },
  { value: showHistRatings.value, set: display.setShowHistRatings, label: t("settings.hist") },
  { value: showStandardChallenges.value, set: display.setShowStandardChallenges, label: t("settings.showStandardChallenges") },
]);

const tierLabel = (tier: TierCode) => (compactTierLabels.value ? tierMeta[tier].short : tierMeta[tier].label);

function applyPalette(palette: TierColorMap) {
  draft.value = { ...palette };
  display.setTierColors({ ...palette });
}

async function exportColors() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(draft.value, null, 2));
    notice.value = "settings.copySuccess";
  } catch {
    notice.value = "settings.copyFailure";
  }
}

async function importColors() {
  try {
    const imported = JSON.parse(await navigator.clipboard.readText()) as Partial<TierColorMap>;
    const next = { ...DEFAULT_TIER_COLORS, ...imported };
    draft.value = next;
    display.setTierColors(next);
    notice.value = "settings.importSuccess";
  } catch {
    /* 粘贴了一段不是配色的文本时要说出来，不能像旧版那样静默失败。 */
    notice.value = "settings.importFailure";
  }
}

function save() {
  display.setTierColors({ ...draft.value });
  notice.value = "settings.saveSuccess";
}
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="t('settings.title')" :bordered="false" style="max-width: 560px; width: calc(100vw - 32px)">
    <section class="section">
      <h3 class="section-title">{{ t("settings.language") }}</h3>
      <NRadioGroup :value="locale" size="small" :aria-label="t('settings.language')" @update:value="(value: 'zh-CN' | 'en') => setLocale(value)">
        <NRadioButton v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</NRadioButton>
      </NRadioGroup>
      <p class="hint">{{ t("settings.languageHint") }}</p>
    </section>

    <section class="section">
      <h3 class="section-title">{{ t("settings.theme") }}</h3>
      <NRadioGroup :value="themeMode" size="small" :aria-label="t('settings.theme')" @update:value="(value: ThemeMode) => display.setThemeMode(value)">
        <NRadioButton v-for="option in themeOptions" :key="option.value" :value="option.value">{{ option.label }}</NRadioButton>
      </NRadioGroup>
      <p class="hint">{{ t("settings.themeHint") }}</p>
    </section>

    <section class="section">
      <h3 class="section-title">{{ t("settings.display") }}</h3>
      <div class="checks">
        <NCheckbox v-for="item in checks" :key="item.label" :checked="item.value" @update:checked="item.set">
          {{ item.label }}
        </NCheckbox>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h3 class="section-title">{{ t("settings.colors", { term: compactTierLabels ? "T" : "Tier" }) }}</h3>
        <div class="presets">
          <NButton size="tiny" @click="applyPalette(DEFAULT_TIER_COLORS)">{{ t("settings.defaultColors") }}</NButton>
          <NButton size="tiny" @click="applyPalette(GB_TIER_COLORS)">{{ t("settings.gbColors") }}</NButton>
        </div>
      </div>
      <div class="offset" :data-inactive="theme !== 'light' || undefined">
        <div class="offset-head">
          <label class="color-name" for="light-tier-offset">{{ t("settings.lightTierOffset", { term: compactTierLabels ? "T" : "Tier" }) }}</label>
          <span class="offset-value">{{ offsetPercent }}</span>
          <NButton
            quaternary
            size="tiny"
            :disabled="lightTierOffset === DEFAULT_LIGHT_TIER_OFFSET"
            @click="display.setLightTierOffset(DEFAULT_LIGHT_TIER_OFFSET)"
          >{{ t("settings.reset") }}</NButton>
        </div>
        <NSlider id="light-tier-offset" v-model:value="offsetPercent" :min="0" :max="MAX_LIGHT_TIER_OFFSET * 100" :step="1" :tooltip="false" />
        <p class="hint">{{ t("settings.lightTierOffsetHint") }}</p>
      </div>
      <div class="colors">
        <div v-for="tier in tierOrder" :key="tier" class="color-row">
          <span class="color-name">{{ tierLabel(tier) }}</span>
          <!-- 取色器的触发块自己就显示色值，旁边不再并一个 HEX 输入框。 -->
          <NColorPicker to="body"
            v-model:value="draft[tier]"
            :modes="['hex']"
            :show-alpha="false"
            size="small"
            class="swatch"
            :aria-label="t('settings.colorPicker', { tier: tierMeta[tier].label })"
          />
        </div>
      </div>
    </section>

    <template #footer>
      <div class="footer">
        <span v-if="notice" class="notice">{{ t(notice) }}</span>
        <NButton quaternary size="small" @click="exportColors">{{ t("settings.copy") }}</NButton>
        <NButton quaternary size="small" @click="importColors">{{ t("settings.import") }}</NButton>
        <NButton type="primary" size="small" :disabled="!dirty" @click="save">{{ t("settings.save") }}</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.section { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-5); }
.section:last-of-type { margin-bottom: 0; }
.section-title {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
.presets { display: flex; gap: var(--sp-2); }
.hint { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); line-height: var(--lh-body); }

.checks { display: grid; gap: var(--sp-3); }

.offset { display: grid; gap: var(--sp-1); }
.offset[data-inactive] { opacity: .6; }
.offset-head { display: flex; align-items: center; gap: var(--sp-2); }
.offset-head .color-name { flex: 1; }
.offset-value { font-family: var(--font-num); font-size: var(--fs-sm); color: var(--fg-default); font-variant-numeric: var(--num-tabular); }

/* 不再单独限高滚动：弹层本身已限高，正文整体滚动，避免嵌套滚动条。 */
.colors { display: grid; gap: var(--sp-2); }
.color-row { display: grid; grid-template-columns: 1fr 116px; align-items: center; gap: var(--sp-3); }
.color-name { font-size: var(--fs-sm); color: var(--fg-secondary); }
/* 色值是数据，用等宽体；宽度按 #RRGGBB 七个字符给足，不要让它折行。 */
.swatch :deep(.n-color-picker-trigger__value) { font-family: var(--font-num); font-size: var(--fs-sm); }

/* 正文滚动时与按钮栏之间要有分界，否则取色行会直接压到按钮下面。 */
.footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2); padding-top: var(--sp-3); border-top: var(--hairline); }
.notice { margin-right: auto; font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 480px) {
  .color-row { grid-template-columns: 1fr 104px; }
}
</style>
