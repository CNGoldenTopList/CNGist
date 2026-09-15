<script setup lang="ts">
/**
 * 一条投票分布：绿＝支持，红＝反对，中性灰＝中立。
 * 已完成与未完成的人分开计票，分歧一眼看得出来 —— 这是意见箱存在的理由。
 */
import { computed } from "vue";
import { useLanguage } from "@/i18n";

export type Tally = { yes: number; no: number; neutral: number };

const props = defineProps<{ label: string; tally: Tally }>();
const { t } = useLanguage();

const total = computed(() => props.tally.yes + props.tally.no + props.tally.neutral);
</script>

<template>
  <div class="bar">
    <div class="bar-head">
      <span>{{ label }}</span>
      <small>{{ t("feedback.voters", { count: total }) }}</small>
    </div>
    <div class="bar-track" role="img" :aria-label="t('feedback.voteShare', { yes: tally.yes, no: tally.no, neutral: tally.neutral })">
      <i v-if="!total" class="bar-empty" />
      <template v-else>
        <i class="bar-yes" :style="{ width: `${tally.yes / total * 100}%` }" />
        <i class="bar-no" :style="{ width: `${tally.no / total * 100}%` }" />
        <i class="bar-neutral" :style="{ width: `${tally.neutral / total * 100}%` }" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.bar { display: grid; gap: var(--sp-2); min-width: 0; }
.bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
}
.bar-head small { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); }
.bar-track { display: flex; height: 6px; border-radius: var(--r-pill); overflow: hidden; background: var(--bg-inset); }
.bar-yes { background: var(--ok-600); }
.bar-no { background: var(--danger-600); }
.bar-neutral { background: var(--n-600); }
.bar-empty { flex: 1; background: var(--bg-inset); }
</style>
