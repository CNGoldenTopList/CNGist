<script setup lang="ts">
/**
 * 难度徽章 —— 全站的身份元素。
 *
 * 底色由显示设置的 tierColors 通过内联变量给出，用户改配色时徽章跟着变。
 * 文字固定为深色：17 档 Tier 色全部落在 OKLCH 明度 0.85 上下的高亮档，
 * 深色文字在每一档上都有足够对比度。
 *
 * 根类名带前缀：子组件的根元素会同时挂上父组件的 scope id，父组件 scoped
 * 样式里任何同名的裸类选择器都会漏进来。裸 `.badge` 曾经被记录详情页的
 * 标签样式压成圆角方块 —— 名字独一份，这类碰撞就不会再发生。
 *
 * 宽度固定（--tier-badge-w）：同一列里的 C / C/FC / FC 必须对齐，
 * 徽章不能随文字长短伸缩。这条约束不要改。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { isStandardTier, standardMeta, tierBadgeLabel } from "@shared/tiers";
import type { DifficultyCode } from "@shared/types";
import { useDisplayStore } from "@/stores/display";
import { useLanguage } from "@/i18n";

const props = withDefaults(defineProps<{ tier: DifficultyCode; size?: "sm" | "md" | "lg" }>(), { size: "md" });

const { t } = useLanguage();
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

const color = computed(() =>
  props.tier === "undetermined" ? undefined
    : isStandardTier(props.tier) ? standardMeta[props.tier].color
      : tierColors.value[props.tier]);

const label = computed(() => {
  if (props.tier === "undetermined") return t("common.undetermined");
  const full = tierBadgeLabel(props.tier);
  return compactTierLabels.value ? full.replace(/Tier /, "T") : full;
});
</script>

<template>
  <span class="tier-badge" :class="[size, { undetermined: tier === 'undetermined' }]" :style="color ? { '--tier-badge-color': color } : undefined">
    {{ label }}
  </span>
</template>

<style scoped>
.tier-badge {
  font-family: var(--font-body);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 auto;
  min-width: var(--tier-badge-w);
  border-radius: var(--r-pill);
  /* 一圈极淡的深色描边：底色是高亮度彩色，没有描边时
     它在浅色与深色地面上的边界都会发虚。 */
  border: 1px solid rgb(0 0 0 / .18);
  background: var(--tier-badge-color, var(--n-200));
  color: #17202a;
  font-weight: var(--fw-bold);
  letter-spacing: 0;
  white-space: nowrap;
  font-variant-numeric: var(--num-tabular);
}

.tier-badge.sm { height: 22px; padding-inline: var(--sp-2); min-width: 56px; font-size: var(--fs-micro); }
.tier-badge.md { height: 28px; padding-inline: var(--sp-3); font-size: var(--fs-sm); }
.tier-badge.lg { height: 34px; padding-inline: var(--sp-4); font-size: var(--fs-lead); }

.tier-badge.undetermined { background: var(--tier-undetermined); }
</style>
