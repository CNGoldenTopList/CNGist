<script setup lang="ts">
/** 挑战难度与定级意见共用：正式 Tier、低于 T7 的 Standard、未定档。 */
import { computed, h } from "vue";
import { NSelect } from "naive-ui";
import { standardMeta, standardOrder, tierDisplayLabel, tierOrder } from "@shared/tiers";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import { storeToRefs } from "pinia";

const value = defineModel<string | null>({ required: true });
defineProps<{ placeholder?: string; ariaLabel?: string; disabled?: boolean }>();

const { t } = useLanguage();
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

/** 候选带色点：难度是颜色编码的，选单里也该看得到那一档长什么样。 */
const options = computed(() => [
  { value: "undetermined", label: t("common.undetermined"), color: "" },
  ...tierOrder.map((tier) => ({ value: tier, label: tierDisplayLabel(tier, compactTierLabels.value), color: tierColors.value[tier] })),
  ...standardOrder.map((tier) => ({ value: tier, label: standardMeta[tier].label, color: standardMeta[tier].color })),
]);

const renderLabel = (option: { label: string; color: string }) => h("span", { style: "display:inline-flex;align-items:center;gap:8px" }, [
  option.color ? h("i", { style: `width:10px;height:10px;border-radius:2px;background:${option.color}` }) : null,
  option.label,
]);
</script>

<template>
  <NSelect
    v-model:value="value"
    :options="options"
    :render-label="renderLabel"
    :placeholder="placeholder"
    :disabled="disabled"
    clearable
    :aria-label="ariaLabel ?? t('feedback.suggestedTier')"
  />
</template>
