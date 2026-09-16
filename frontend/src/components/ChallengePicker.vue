<script setup lang="ts">
/**
 * 挑战选择器。提交记录、后台新建、意见箱共用。
 *
 * 挑战类型决定下面出不出「地图」这一栏，所以它是表单的第一格、不是标签页：
 * 标签与控件同一行，与下面三个字段同一套语法。
 */
import { computed, useId, watch } from "vue";
import { NRadioButton, NRadioGroup, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { challengeDisplayName } from "@shared/labels";
import { challengeSelectionOptions, type ChallengeSelection } from "@shared/challenge-selection";
import { catalog } from "@/lib/catalog";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import FormField from "@/components/FormField.vue";

const props = withDefaults(defineProps<{
  modelValue: ChallengeSelection;
  mapOnly?: boolean;
  excludeStandard?: boolean;
  error?: string;
}>(), { mapOnly: false, excludeStandard: false });

const emit = defineEmits<{ "update:modelValue": [value: ChallengeSelection] }>();

const { t } = useLanguage();
const { nameMode } = storeToRefs(useDisplayStore());
const id = useId();

const options = computed(() => challengeSelectionOptions(catalog.value, props.modelValue, props.mapOnly, props.excludeStandard));
const current = computed(() => options.value.value);
const publicationUrl = computed(() => {
  const campaign = options.value.campaigns.find((item) => item.id === current.value.campaignId);
  const url = campaign?.gameBananaUrl || campaign?.url;
  return url && /^https?:\/\//i.test(url) ? url : undefined;
});

/* ID 是唯一权威：目录刷新后失效的选择要立刻收敛回去，而不是留一个指向
   不存在实体的编号。 */
watch(current, (value) => {
  const from = props.modelValue;
  if (value.scope !== from.scope || value.campaignId !== from.campaignId
    || value.mapId !== from.mapId || value.challengeId !== from.challengeId) {
    emit("update:modelValue", value);
  }
}, { immediate: true });

const update = (patch: Partial<ChallengeSelection>) => emit("update:modelValue", { ...current.value, ...patch });

const named = (item: { id: number; name: string; cnName?: string; shortName?: string }) => ({
  value: item.id,
  label: nameMode.value === "cn" && item.cnName ? item.cnName
    : nameMode.value === "both" && item.cnName ? `${item.name} · ${item.cnName}`
      : item.name,
});

const campaignOptions = computed(() => options.value.campaigns.map(named));
const mapOptions = computed(() => options.value.maps.map(named));
const challengeOptions = computed(() => options.value.challenges.map((item) => ({ value: item.id, label: challengeDisplayName(item) })));

const columns = computed(() => (props.mapOnly || current.value.scope === "campaign" ? 2 : 3));
</script>

<template>
  <div class="picker">
    <div v-if="!mapOnly" class="scope">
      <span class="scope-label">{{ t("feedback.scopeLabel") }}</span>
      <NRadioGroup
        :value="current.scope"
        size="small"
        :aria-label="t('feedback.scopeLabel')"
        @update:value="(scope: 'map' | 'campaign') => update({ scope, mapId: null, challengeId: null })"
      >
        <NRadioButton value="map">{{ t("feedback.mapScope") }}</NRadioButton>
        <NRadioButton value="campaign">{{ t("feedback.campaignScope") }}</NRadioButton>
      </NRadioGroup>
    </div>

    <div class="fields" :data-columns="columns">
      <FormField :label="t('common.campaigns')" :html-for="`${id}-campaign`" required>
        <NSelect
          :id="`${id}-campaign`"
          :value="current.campaignId"
          :options="campaignOptions"
          filterable
          clearable
          :placeholder="t('feedback.chooseCampaign')"
          :status="error && !current.campaignId ? 'error' : undefined"
          :aria-label="t('common.campaigns')"
          @update:value="(campaignId: number | null) => update({ campaignId, mapId: null, challengeId: null })"
        />
        <p class="publication">
          <a v-if="publicationUrl" :href="publicationUrl" :title="publicationUrl" target="_blank" rel="noopener noreferrer">{{ publicationUrl }}</a>
        </p>
      </FormField>

      <FormField v-if="current.scope === 'map'" :label="t('common.maps')" :html-for="`${id}-map`" required>
        <NSelect
          :id="`${id}-map`"
          :value="current.mapId"
          :options="mapOptions"
          filterable
          clearable
          :disabled="!current.campaignId"
          :placeholder="t('feedback.chooseMap')"
          :status="error && !current.mapId ? 'error' : undefined"
          :aria-label="t('common.maps')"
          @update:value="(mapId: number | null) => update({ mapId, challengeId: null })"
        />
      </FormField>

      <FormField v-if="!mapOnly" :label="t('challenge.kicker')" :html-for="`${id}-challenge`" :error="error" required>
        <NSelect
          :id="`${id}-challenge`"
          :value="current.challengeId"
          :options="challengeOptions"
          filterable
          clearable
          :disabled="current.scope === 'map' ? !current.mapId : !current.campaignId"
          :placeholder="t('feedback.chooseChallenge')"
          :status="error ? 'error' : undefined"
          :aria-label="t('challenge.kicker')"
          @update:value="(challengeId: number | null) => update({ challengeId })"
        />
      </FormField>
    </div>
  </div>
</template>

<style scoped>
.picker { display: grid; gap: var(--sp-4); min-width: 0; container-type: inline-size; }
.fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-4); align-items: start; }
/* 未选择或没有发布地址时也保留一行，避免表单高度跳动。 */
.publication { margin: 0; min-width: 0; height: 1.5em; font-size: var(--fs-micro); line-height: 1.5; }
.publication a { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fields[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@container (max-width: 520px) {
  .fields, .fields[data-columns="2"] { grid-template-columns: minmax(0, 1fr); }
}

/* 挑战类型：标签与控件同一行，整体只占一行高，读作表单的第一格而不是
   一排标签页。标签样式与字段标签一致，好让它归到表单的语法里。 */
.scope { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; min-width: 0; }
.scope-label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
</style>
