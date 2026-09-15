<script setup lang="ts">
/** 注意事项。整站唯一的提示条形态。 */
import { useLanguage } from "@/i18n";

defineProps<{ text?: string }>();
const { t } = useLanguage();
</script>

<template>
  <aside v-if="text" class="notice" :aria-label="t('common.notice')">
    <strong>{{ t("common.notice") }}</strong>
    <p>{{ text }}</p>
  </aside>
</template>

<style scoped>
/* 左侧一道色脊 + 下沉的地面，不画整圈边框 —— 与全站其余分区手段一致。
   用交互色而不是危险色：这是提示，不是错误。 */
.notice {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--accent-500);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.notice strong {
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .12em;
  color: var(--accent-300);
}
.notice p {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-snug);
  color: var(--fg-secondary);
  white-space: pre-wrap;
}
</style>
