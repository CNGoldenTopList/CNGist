<script setup lang="ts">
import { computed, h, ref } from "vue";
import { NAutoComplete } from "naive-ui";
import { searchable } from "@shared/search";
import type { CampaignSuggestion, CampaignSuggestions } from "@shared/gamebanana";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
const props = defineProps<{ value: string; gameBananaUrl: string; status?: "error" }>();
const emit = defineEmits<{ "update:value": [value: string]; "update:gameBananaUrl": [value: string] }>();
const { t } = useLanguage();
const campaigns = ref<CampaignSuggestion[]>([]);
const loading = ref(false);
const failed = ref(false);
let expiresAt = 0;
let selected: CampaignSuggestion | undefined;
async function load() {
  if (loading.value || Date.now() < expiresAt) return;
  loading.value = true;
  const result = await api.get<CampaignSuggestions>("/api/submissions/campaign-suggestions");
  loading.value = false;
  failed.value = !result.ok;
  if (result.ok) { campaigns.value = result.data.campaigns; expiresAt = result.data.expiresAt; }
  else campaigns.value = [];
}
const options = computed(() => props.value.trim() ? campaigns.value
  .filter(c => searchable([c.name], undefined, props.value))
  .sort((a, b) => Number(b.name.toLowerCase() === props.value.toLowerCase()) - Number(a.name.toLowerCase() === props.value.toLowerCase()) || a.name.localeCompare(b.name))
  .slice(0, 30).map(c => ({ label: c.name, value: String(c.id), url: c.gameBananaUrl })) : []);
const renderLabel = (option: { label?: unknown; url?: unknown }) => h("div", { style: "white-space:normal;line-height:1.5;padding:3px 0" }, [
  h("div", String(option.label)), h("small", { style: "opacity:.65" }, String(option.url)),
]);
function select(id: string) {
  selected = campaigns.value.find(c => String(c.id) === id);
  if (selected) { emit("update:value", selected.name); emit("update:gameBananaUrl", selected.gameBananaUrl); }
}
function update(value: string | null) {
  const name = value ?? "";
  if (selected && name !== selected.name) {
    if (props.gameBananaUrl === selected.gameBananaUrl) emit("update:gameBananaUrl", "");
    selected = undefined;
  }
  emit("update:value", name);
}
</script>
<template>
  <NAutoComplete :value="value" :options="options" :loading="loading" :status="status" :render-label="renderLabel"
    :placeholder="t('submit.campaignAutocomplete')" :get-show="value => !!value.trim()" clearable
    @focus="load" @update:value="update" @select="select" />
  <small v-if="failed" role="status">{{ t('submit.campaignAutocompleteFailed') }}</small>
</template>
