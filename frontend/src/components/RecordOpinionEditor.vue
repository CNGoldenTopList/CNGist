<script setup lang="ts">
/**
 * 就地修改一条记录的推荐与难度建议。只有记录的主人和管理员看得到这个入口。
 */
import { computed, h, ref, watch } from "vue";
import { NButton, NModal, NRadioButton, NRadioGroup, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { isRatedTier, ratedTierColor, ratedTierOrder, tierBadgeLabel } from "@shared/tiers";
import type { Submission } from "@shared/types";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import FormField from "@/components/FormField.vue";

const props = defineProps<{ record: Pick<Submission, "id" | "playerId" | "opinionTier" | "recommends"> }>();
const emit = defineEmits<{ saved: [] }>();

const { t, apiError } = useLanguage();
const { account, isAdmin, adminMode } = storeToRefs(useSessionStore());
const { tierColors, compactTierLabels } = storeToRefs(useDisplayStore());

const allowed = computed(() => Boolean(account.value
  && (account.value.claimedPlayerId === props.record.playerId || (isAdmin.value && adminMode.value))));

const open = ref(false);
const recommendation = ref<"none" | "yes" | "no">("none");
const tier = ref<string | null>(null);
const saving = ref(false);
const error = ref("");

watch(() => props.record, (record) => {
  recommendation.value = typeof record.recommends === "boolean" ? (record.recommends ? "yes" : "no") : "none";
  tier.value = record.opinionTier ?? null;
}, { immediate: true, deep: true });

/** 档位选项带色块：难度是颜色编码的，选单里也该看得到那一档长什么样。 */
const tierOptions = computed(() => [
  { value: "", label: t("common.unfilled"), color: "" },
  ...[...ratedTierOrder].reverse().map((item) => ({
    value: item,
    label: compactTierLabels.value ? tierBadgeLabel(item).replace(/Tier\s*/g, "T") : tierBadgeLabel(item),
    color: ratedTierColor(item, tierColors.value),
  })),
]);

const renderTierLabel = (option: { label: string; color: string }) => h("span", { style: "display:inline-flex;align-items:center;gap:8px" }, [
  option.color ? h("i", { style: `width:10px;height:10px;border-radius:2px;background:${option.color}` }) : null,
  option.label,
]);

async function save() {
  saving.value = true;
  error.value = "";
  const payload = {
    recommends: recommendation.value === "none" ? null : recommendation.value === "yes",
    opinionTier: isRatedTier(tier.value) ? tier.value : null,
  };
  const { ok, data } = await api.patch(`/api/submissions/${props.record.id}/opinion`, payload);
  saving.value = false;
  if (!ok) { error.value = apiError(data, "common.saveFailed"); return; }
  open.value = false;
  toast.success(t("common.save"));
  emit("saved");
}
</script>

<template>
  <template v-if="allowed">
    <NButton size="tiny" quaternary @click="open = true">{{ t("record.editOpinion") }}</NButton>
    <NModal v-model:show="open" preset="card" :title="t('record.editOpinion')" :bordered="false" style="max-width: 420px; width: calc(100vw - 32px)">
      <template #header-extra><span class="subtitle">{{ t("record.editOpinionHint") }}</span></template>
      <div class="body">
        <FormField :label="t('record.recommendField')">
          <NRadioGroup v-model:value="recommendation" size="small">
            <NRadioButton value="none">{{ t("record.noStance") }}</NRadioButton>
            <NRadioButton value="yes">{{ t("recommendation.yes") }}</NRadioButton>
            <NRadioButton value="no">{{ t("recommendation.no") }}</NRadioButton>
          </NRadioGroup>
        </FormField>
        <FormField :label="t('stats.tierOpinion')">
          <NSelect
            v-model:value="tier"
            :options="tierOptions"
            :placeholder="t('common.unfilled')"
            :render-label="renderTierLabel"
            :aria-label="t('stats.tierOpinion')"
          />
        </FormField>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <div class="foot">
          <NButton quaternary @click="open = false">{{ t("common.cancel") }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t("common.save") }}</NButton>
        </div>
      </template>
    </NModal>
  </template>
</template>

<style scoped>
.body { display: grid; gap: var(--sp-4); }
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.error { margin: 0; font-size: var(--fs-sm); color: var(--danger-400); }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
