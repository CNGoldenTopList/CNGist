<script setup lang="ts">
/**
 * 难度建议分布环。颜色直接读 tierColors —— 用户在显示设置里换了配色，
 * 环上的颜色要跟紧挨着的 Tier 徽章保持一致，不能另存一份硬编码色表。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { ratedTierColor, ratedTierOrder, tierBadgeLabel } from "@shared/tiers";
import type { RatedTier } from "@shared/types";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";

const props = defineProps<{ opinions: RatedTier[] }>();

const { t, locale } = useLanguage();
const { tierColors, compactTierLabels } = storeToRefs(useDisplayStore());

const counts = computed(() => ratedTierOrder
  .map((tier) => ({ tier, count: props.opinions.filter((opinion) => opinion === tier).length }))
  .filter((entry) => entry.count > 0));

const total = computed(() => counts.value.reduce((sum, entry) => sum + entry.count, 0));

const gradient = computed(() => {
  let cursor = 0;
  return counts.value.map(({ tier, count }) => {
    const start = cursor;
    cursor += count / total.value * 360;
    return `${ratedTierColor(tier, tierColors.value)} ${start}deg ${cursor}deg`;
  }).join(", ");
});

const description = computed(() => counts.value
  .map(({ tier, count }) => t("stats.opinionShare", { tier: tierBadgeLabel(tier), count }))
  .join(locale.value === "en" ? ", " : "，"));

const label = (tier: RatedTier) =>
  (compactTierLabels.value ? tierBadgeLabel(tier).replace(/Tier\s*/g, "T") : tierBadgeLabel(tier));
</script>

<template>
  <p v-if="!counts.length" class="pie-empty">{{ t("stats.noTierOpinion") }}</p>
  <div v-else class="wrap">
    <div class="pie" :style="{ background: `conic-gradient(${gradient})` }" role="img" :aria-label="description" />
    <ul class="legend">
      <li v-for="{ tier, count } in counts" :key="tier">
        <i :style="{ background: ratedTierColor(tier, tierColors) }" aria-hidden="true" />
        <span>{{ label(tier) }}</span>
        <b>{{ count }}</b>
        <small>{{ Math.round(count / total * 100) }}%</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 环用 conic-gradient 直接画，不引图表库。 */
.wrap { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--sp-5); }

/* 中心挖空用 mask，而不是叠一个与背景同色的圆 —— 后者在不同地面色的
   容器里会露馅（弹窗与页面的底色并不相同）。 */
.pie {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  mask: radial-gradient(circle, transparent 54%, #000 55%);
  -webkit-mask: radial-gradient(circle, transparent 54%, #000 55%);
}

.legend { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-2); min-width: 0; }
.legend li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
}
.legend i { width: 8px; height: 8px; border-radius: 2px; }
.legend span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 人数与百分比等宽右对齐，多行之间形成两条数字列 */
.legend b, .legend small { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); text-align: right; }
.legend b { color: var(--fg-default); font-weight: var(--fw-medium); }
.legend small { color: var(--fg-subtle); font-size: var(--fs-micro); min-width: 3.2em; }

.pie-empty { margin: 0; padding: var(--sp-5) 0; text-align: center; font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .wrap { grid-template-columns: 1fr; justify-items: center; }
  .legend { width: 100%; }
}
</style>
