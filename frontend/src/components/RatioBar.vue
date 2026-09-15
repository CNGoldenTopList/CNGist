<script setup lang="ts">
/**
 * 比例条 —— 若干段按数值占比铺开的一条轨道。
 * 意见箱的投票分布、推荐率计、地图目录里的推荐条共用这一个。
 */
import { computed } from "vue";
import { useLanguage } from "@/i18n";

export type BarSegment = { value: number; color: string; label: string };

const props = withDefaults(defineProps<{ segments: readonly BarSegment[]; size?: "sm" | "md" }>(), { size: "md" });
const { t } = useLanguage();

const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0));
const description = computed(() => total.value
  ? props.segments.filter((segment) => segment.value > 0).map((segment) => `${segment.label} ${segment.value}`).join(" / ")
  : t("common.noData"));
</script>

<template>
  <div class="ratio-track" :class="size" role="img" :aria-label="description">
    <i v-if="!total" class="empty" />
    <i
      v-for="(segment, index) in segments"
      v-else
      :key="index"
      :style="{ width: `${segment.value / total * 100}%`, background: segment.color }"
    />
  </div>
</template>

<style scoped>
/** 轨道底色用最深的一档地面，空段与已填段的边界因此总是清楚的。 */
.ratio-track { display: flex; width: 100%; border-radius: var(--r-pill); overflow: hidden; background: var(--bg-inset); }
.ratio-track > i { display: block; }
.ratio-track.sm { height: 6px; }
.ratio-track.md { height: 10px; }
.empty { flex: 1; background: var(--bg-inset); }
</style>
