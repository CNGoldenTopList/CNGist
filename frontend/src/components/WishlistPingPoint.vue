<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NSelect } from "naive-ui";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import FormField from "@/components/FormField.vue";

type Room = { sid: string; side: string; roomKey: string; roomName: string; position?: number };
type Settings = { eligible: boolean; disabled: boolean; claimed: boolean; point: Room | null; rooms: Room[] };
const props = defineProps<{ wishId: number }>();
const { t, apiError } = useLanguage();
const settings = ref<Settings | null>(null);
const selected = ref<string | null>(null);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const key = (r: Room) => JSON.stringify([r.sid,r.side,r.roomKey]);
const options = computed(() => {
  const rooms = [...(settings.value?.rooms ?? [])];
  const point = settings.value?.point;
  if (point && !rooms.some(r => key(r) === key(point))) rooms.push(point);
  return rooms.map(r => ({ value: key(r), label: `${r.position ? `${r.position}. ` : ''}${r.roomName} · ${r.side} · ${r.roomKey}` }));
});
const blocked = computed(() => !settings.value || settings.value.disabled || !settings.value.claimed || !settings.value.eligible);
async function load() {
  const result = await api.get<Settings>(`/api/wishlist/ping?wishId=${props.wishId}`);
  if (!result.ok) { error.value = apiError(result.data, "wishlist.saveFailed"); return; }
  settings.value = result.data;
  selected.value = result.data.point ? key(result.data.point) : null;
}
async function save(remove = false) {
  if (busy.value) return;
  busy.value = true; error.value = ""; notice.value = "";
  const point = remove ? null : settings.value?.rooms.find(r => key(r) === selected.value);
  const result = await api.post<{ pingError?: "disabled" | "ineligible" | "claim" | "invalid" }>("/api/wishlist/ping", { wishId: props.wishId, point });
  if (!result.ok) {
    const keys = { disabled: "ping.disabled", ineligible: "ping.ineligible", claim: "ping.claim", invalid: "ping.invalid" } as const;
    error.value = result.data.pingError ? t(keys[result.data.pingError]) : apiError(result.data, "wishlist.saveFailed");
  } else { await load(); notice.value = remove ? "" : t("ping.saved"); }
  busy.value = false;
}
onMounted(load);
</script>

<template>
  <section class="ping">
    <FormField :label="t('ping.title')">
      <div class="controls">
        <NSelect v-model:value="selected" :options="options" :placeholder="t('ping.select')" :aria-label="t('ping.select')" :disabled="busy || blocked" filterable clearable />
        <NButton size="small" :disabled="busy || blocked || !selected" @click="save()">{{ t('ping.save') }}</NButton>
        <NButton v-if="settings?.point" size="small" :disabled="busy" @click="save(true)">{{ t('ping.remove') }}</NButton>
      </div>
    </FormField>
    <p v-if="settings?.disabled" class="hint">{{ t('ping.disabled') }}</p>
    <p v-else-if="settings && !settings.claimed" class="hint">{{ t('ping.claim') }}</p>
    <p v-else-if="settings && !settings.eligible" class="hint">{{ t('ping.ineligible') }}</p>
    <p v-else-if="settings && !settings.rooms.length" class="hint">{{ t('ping.noRooms') }}</p>
    <p class="hint">{{ t('ping.hint') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="hint" role="status">{{ notice }}</p>
  </section>
</template>
<style scoped>
.ping { margin-bottom: var(--sp-4); }
.controls { display: flex; align-items: center; gap: var(--sp-2); }
.controls > :first-child { flex: 1; min-width: 0; }
.hint { margin: var(--sp-2) 0 0; font-size: var(--fs-micro); color: var(--fg-subtle); line-height: var(--lh-body); }
.error { font-size: var(--fs-sm); color: var(--danger-400); }
@media (max-width: 600px) {
  .controls { flex-wrap: wrap; }
  .controls > :first-child { flex-basis: 100%; }
}
</style>
