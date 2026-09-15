<script setup lang="ts">
/** 「从哪一档改到哪一档」。箭头用纯 CSS 画，比 → 字符在中英混排里基线更稳。 */
import type { SuggestionTier } from "@shared/types";
import { useLanguage } from "@/i18n";
import TierBadge from "@/components/TierBadge.vue";

withDefaults(defineProps<{ from?: SuggestionTier; to?: SuggestionTier; size?: "sm" | "md" | "lg" }>(), { size: "md" });
const { t } = useLanguage();
</script>

<template>
  <div v-if="from || to" class="tier-move-row">
    <TierBadge :tier="from ?? 'undetermined'" :size="size" />
    <span class="arrow" aria-hidden="true" />
    <TierBadge v-if="to" :tier="to" :size="size" />
    <span v-else class="tier-blank">{{ t("common.undetermined") }}</span>
  </div>
</template>

<style scoped>
.tier-move-row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.arrow { position: relative; flex: 0 0 auto; width: 16px; height: 8px; }
.arrow::before { content: ""; position: absolute; top: 50%; left: 0; right: 3px; height: 1px; background: var(--fg-subtle); }
.arrow::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 0;
  width: 5px;
  height: 5px;
  border-top: 1px solid var(--fg-subtle);
  border-right: 1px solid var(--fg-subtle);
  transform: translateY(-50%) rotate(45deg);
}
.tier-blank { font-size: var(--fs-sm); color: var(--fg-disabled); }
</style>
