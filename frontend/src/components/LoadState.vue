<script setup lang="ts">
/**
 * 加载与空态 —— 全站唯一实现。
 *
 * 占位在自己所占的方框里水平垂直居中，看起来是「这块内容正在来」，
 * 而不是「这里多了一行说明」。空态给一句可操作的话，不是一个灰句号。
 */
import { NEmpty, NSpin } from "naive-ui";
import { useLanguage } from "@/i18n";

withDefaults(defineProps<{
  /** loading —— 正在取数；empty —— 取到了但没有内容 */
  state?: "loading" | "empty";
  label?: string;
  /** block —— 区块内占位；page —— 整页占位 */
  variant?: "block" | "page";
}>(), { state: "loading", variant: "block" });

const { t } = useLanguage();
</script>

<template>
  <div class="state" :class="variant" role="status" aria-live="polite">
    <NSpin v-if="state === 'loading'" size="small">
      <template #description>
        <span class="label">{{ label ?? t("common.loading") }}</span>
      </template>
    </NSpin>
    <NEmpty v-else :description="label ?? t('common.noResults')">
      <template v-if="$slots.default" #extra><slot /></template>
    </NEmpty>
  </div>
</template>

<style scoped>
.state {
  display: grid;
  justify-items: center;
  align-content: center;
  padding: var(--sp-6) var(--sp-5);
  text-align: center;
  color: var(--fg-subtle);
}
.block { min-height: 180px; }
/* 整页占位：减去页头高度后仍居中，避免顶在导航下方 */
.page { min-height: min(60vh, 480px); }
.label { font-size: var(--fs-body); color: var(--fg-subtle); }
</style>
