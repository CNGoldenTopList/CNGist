<script setup lang="ts">
/**
 * 地图级 Hist 星级。默认不显示，由显示设置里的「Hist 评级」开关打开。
 *
 * 形态与 Tier 徽章刻意分开：这里是 1px 描边配同色文字，Tier 是实心填充。
 * 色相带已经被 17 档 Tier 占满，指望靠颜色把两者分开是做不到的。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { histLabel } from "@shared/hist";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import { getMap } from "@/lib/selectors";

const props = withDefaults(defineProps<{ mapId?: number; size?: "sm" | "md" | "lg" }>(), { size: "sm" });

const { t, locale } = useLanguage();
const { showHistRatings, theme } = storeToRefs(useDisplayStore());

const map = computed(() => (props.mapId ? getMap(props.mapId) : undefined));
const visible = computed(() => showHistRatings.value && map.value?.histStars != null);

/** 星级越高色相越暖，与 CNHist 自己的渲染保持一致。亮色主题下是描边文字，要压暗才读得清。 */
const color = computed(() => {
  const light = theme.value === "light";
  const stars = map.value?.histStars;
  if (!stars) return light ? "#76694f" : "#b8aa92";
  const step = Math.max(0, Math.min(9, (stars - 1) * 2 + (map.value?.histSubTier === "lower" ? 0 : 1)));
  return `hsl(${44 - step * 44 / 9} ${light ? "80% 32%" : "88% 72%"})`;
});

const text = computed(() => (map.value?.histStars == null ? ""
  : `Hist · ${histLabel({ stars: map.value.histStars, subTier: map.value.histSubTier ?? null }, locale.value)}`));
</script>

<template>
  <span v-if="visible" class="hist-badge" :class="size" :style="{ '--hist-color': color }" :title="t('tier.hist')">{{ text }}</span>
</template>

<style scoped>
.hist-badge {
  font-family: var(--font-body);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 auto;
  border: 1px solid currentColor;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--hist-color);
  font-variant-numeric: var(--num-tabular);
  font-weight: var(--fw-medium);
  white-space: nowrap;
}
.hist-badge.sm { height: 22px; padding-inline: var(--sp-2); font-size: var(--fs-micro); }
.hist-badge.md { height: 28px; padding-inline: var(--sp-3); font-size: var(--fs-sm); }
.hist-badge.lg { height: 34px; padding-inline: var(--sp-4); font-size: var(--fs-lead); }
</style>
