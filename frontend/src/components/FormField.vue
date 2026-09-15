<script setup lang="ts">
/**
 * 表单字段 —— 标签、控件、提示与错误的统一容器。
 *
 * 控件本身由调用方传进来（NInput / NSelect / NDatePicker 都行），
 * 这里只负责排布与状态。标签多为中文，不做大写与字距处理 ——
 * 那只对拉丁字母有效。
 */
import { useLanguage } from "@/i18n";

withDefaults(defineProps<{
  label: string;
  /** 常态下的辅助说明；出现 error 时让位给错误文案 */
  hint?: string;
  /** 非空即表示错误态 */
  error?: string;
  required?: boolean;
  htmlFor?: string;
  /** 在网格布局里占满整行 */
  wide?: boolean;
}>(), { required: false, wide: false });

const { t } = useLanguage();
</script>

<template>
  <div class="field" :class="{ wide }">
    <label class="label" :for="htmlFor">
      {{ label }}
      <span v-if="required" class="required" :aria-label="t('common.required')">*</span>
    </label>
    <slot />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field { display: grid; gap: var(--sp-2); align-content: start; min-width: 0; }
.wide { grid-column: 1 / -1; }

.label {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--fg-muted);
}
.required { color: var(--danger-400); }

.hint { margin: 0; font-size: var(--fs-micro); line-height: var(--lh-snug); color: var(--fg-subtle); }
.error { margin: 0; font-size: var(--fs-micro); line-height: var(--lh-snug); color: var(--danger-400); }
</style>
