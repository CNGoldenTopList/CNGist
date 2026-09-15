<script setup lang="ts">
/**
 * 显示设置。网站语言、四个显示开关、17 档 Tier 配色。
 *
 * 配色先改草稿再保存：调色板是 17 个联动的值，边拖边写库会把每一帧
 * 都发出去。预设按钮是例外——点「默认配色」就是要立刻看到效果。
 */
import { computed, ref, watch } from "vue";
import { NButton, NCheckbox, NColorPicker, NModal, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { tierMeta, tierOrder } from "@shared/tiers";
import type { TierCode } from "@shared/types";
import { useLanguage, type MessageKey } from "@/i18n";
import { DEFAULT_TIER_COLORS, GB_TIER_COLORS, useDisplayStore, type TierColorMap } from "@/stores/display";

const show = defineModel<boolean>("show", { required: true });
const { t, locale, setLocale } = useLanguage();
const display = useDisplayStore();
const {
  compactTierLabels, onlyOfficialChinese, showHistRatings, showStandardChallenges, tierColors,
} = storeToRefs(display);

const draft = ref<TierColorMap>({ ...tierColors.value });
const notice = ref<MessageKey | "">("");

watch(show, (open) => {
  if (!open) return;
  draft.value = { ...tierColors.value };
  notice.value = "";
});

const dirty = computed(() => tierOrder.some((tier) => draft.value[tier] !== tierColors.value[tier]));

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
      <label class="section-title" for="site-language">{{ t("settings.language") }}</label>
      <NSelect
        id="site-language"
        :value="locale"
        :options="languageOptions"
        @update:value="(value: 'zh-CN' | 'en') => setLocale(value)"
      />
      <p class="hint">{{ t("settings.languageHint") }}</p>
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
      <div class="colors">
        <div v-for="tier in tierOrder" :key="tier" class="color-row">
          <span class="color-name">{{ tierLabel(tier) }}</span>
          <!-- 取色器的触发块自己就显示色值，旁边不再并一个 HEX 输入框。 -->
          <NColorPicker
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

.colors { display: grid; gap: var(--sp-2); max-height: 42vh; overflow-y: auto; padding-right: var(--sp-2); }
.color-row { display: grid; grid-template-columns: 1fr 116px; align-items: center; gap: var(--sp-3); }
.color-name { font-size: var(--fs-sm); color: var(--fg-secondary); }
/* 色值是数据，用等宽体；宽度按 #RRGGBB 七个字符给足，不要让它折行。 */
.swatch :deep(.n-color-picker-trigger__value) { font-family: var(--font-num); font-size: var(--fs-sm); }

.footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2); }
.notice { margin-right: auto; font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 480px) {
  .color-row { grid-template-columns: 1fr 104px; }
}
</style>
