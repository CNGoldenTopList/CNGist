<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { NButton, NDatePicker } from "naive-ui";
import { latestDailySummaryDate, dailySummaryWindow, type DailySummary } from "@shared/daily-summary";
import { challengeDisplayName } from "@shared/labels";
import { api } from "@/lib/api";
import { challengeHref, multiChallengeHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";
import PageShell from "@/components/PageShell.vue";
import LoadState from "@/components/LoadState.vue";
import TierBadge from "@/components/TierBadge.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import LocalizedName from "@/components/LocalizedName.vue";

const { t } = useLanguage();
const route = useRoute(), router = useRouter();
const date = computed(() => typeof route.query.date === "string" ? route.query.date : latestDailySummaryDate());
const summary = ref<DailySummary | null>(null);
const loading = ref(false), failed = ref(false);
let requestId = 0;
const stamp = computed(() => {
  try { dailySummaryWindow(date.value); return new Date(`${date.value}T12:00:00+08:00`).getTime(); }
  catch { return null; }
});
function chooseDate(date: string | null) {
  if (date) void router.replace({ path: "/daily-summary", query: { date } });
}
function selectDate(value: number | null) {
  if (value === null) return;
  const date = new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  chooseDate(date);
}
async function load() {
  const id = ++requestId;
  loading.value = true; failed.value = false; summary.value = null;
  const result = await api.get<DailySummary>(`/api/daily-summary?date=${encodeURIComponent(date.value)}`);
  if (id !== requestId) return;
  loading.value = false;
  if (result.ok) summary.value = result.data; else failed.value = true;
}
watch(date, load, { immediate: true });
const timer = window.setInterval(() => {
  if (summary.value && Date.parse(summary.value.to) > Date.now() && document.visibilityState === "visible") void load();
}, 60_000);
onUnmounted(() => { requestId++; window.clearInterval(timer); });
const fromDate = computed(() => summary.value ? new Date(Date.parse(summary.value.from) + 8 * 3_600_000).toISOString().slice(0, 10) : "");
const time = (value: string) => new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(5, 16);
</script>

<template>
  <PageShell :title="t('summary.title')" width="wide">
    <template #lede>
      <span v-if="summary">{{ t('summary.window', { from: fromDate, to: summary.date }) }}</span>
    </template>
    <template #actions>
      <div class="date-controls">
        <NButton :disabled="stamp === null" :aria-label="t('summary.previous')" @click="selectDate(stamp! - 86400000)">←</NButton>
        <NDatePicker :formatted-value="stamp === null ? null : date" value-format="yyyy-MM-dd" type="date" :clearable="false" :aria-label="t('summary.date')" @update:formatted-value="chooseDate" />
        <NButton :disabled="stamp === null" :aria-label="t('summary.next')" @click="selectDate(stamp! + 86400000)">→</NButton>
      </div>
    </template>
    <LoadState v-if="loading" />
    <div v-else-if="failed" role="alert" class="error">
      <p>{{ t('summary.failed') }}</p><NButton @click="load">{{ t('summary.retry') }}</NButton>
    </div>
    <template v-else-if="summary">
      <div class="toolbar">
        <span>{{ t('summary.count', { count: summary.records.length, std: summary.stdCount }) }}</span>
        <span v-if="Date.parse(summary.to) > Date.now()">{{ t('summary.live') }}</span>
      </div>
      <LoadState v-if="!summary.records.length" state="empty" :label="t('summary.empty')" />
      <div v-else class="board" role="table" :aria-label="t('summary.title')">
        <div class="head" role="row">
          <span role="columnheader">{{ t('summary.player') }}</span><span role="columnheader">{{ t('summary.map') }}</span>
          <span role="columnheader">{{ t('summary.challenge') }}</span><span role="columnheader">{{ t('summary.time') }}</span>
        </div>
        <div v-for="record in summary.records" :key="record.id" class="row" role="row">
          <div class="player cell" role="cell">
            <PlayerAvatar :player-id="record.playerId" :name="record.playerName" class="avatar" />
            <RouterLink :to="`/player/${record.playerId}`">{{ record.playerName }}</RouterLink>
          </div>
          <div class="cell map" role="cell">
            <RouterLink v-if="record.mapId" :to="`/map/${record.mapId}`"><LocalizedName :name="record.mapName!" :cn-name="record.mapCnName ?? undefined" inline /></RouterLink>
            <RouterLink :to="`/campaign/${record.campaignId}`" :class="{ sub: record.mapId }"><LocalizedName :name="record.campaignName" :cn-name="record.campaignCnName ?? undefined" inline /></RouterLink>
          </div>
          <div class="cell challenge" role="cell">
            <TierBadge :tier="record.tier" size="sm" />
            <RouterLink :to="record.mapId ? challengeHref(record.challengeId, record.mapId) : multiChallengeHref(record.challengeId)">{{ challengeDisplayName({ name: record.challengeName }) }}</RouterLink>
          </div>
          <div class="cell accepted" role="cell"><time :datetime="record.acceptedAt">{{ time(record.acceptedAt) }}</time><RouterLink class="sub" :to="`/record/${record.id}`">{{ t('summary.record') }} ↗</RouterLink></div>
        </div>
      </div>
    </template>
  </PageShell>
</template>

<style scoped>
.date-controls { display: flex; align-items: center; gap: var(--sp-2); }
.date-controls :deep(.n-date-picker) { width: 155px; }
.toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-4); color: var(--fg-muted); font-size: var(--fs-sm); }
.head, .row { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(180px, 2fr) minmax(160px, 1.4fr) 120px; gap: var(--sp-5); padding: var(--sp-3) var(--sp-4); border-bottom: var(--hairline); align-items: center; }
.head { font-size: var(--fs-micro); color: var(--fg-subtle); }
.row:hover { background: var(--bg-surface); }
.cell { min-width: 0; overflow-wrap: anywhere; }
.cell a:hover { color: var(--link-hover); text-decoration: underline; }
.player, .challenge { display: flex; align-items: center; gap: var(--sp-3); }
.player a { font-weight: var(--fw-medium); color: var(--fg-default); }
.avatar { --avatar-size: 32px; flex: 0 0 auto; }
.map, .accepted { display: grid; gap: var(--sp-1); }
.sub { font-size: var(--fs-micro); color: var(--fg-muted); }
.accepted time { font-family: var(--font-num); font-size: var(--fs-sm); color: var(--fg-secondary); }
.error { padding-block: var(--sp-6); text-align: center; }
@media (max-width: 760px) {
  .head { display: none; }
  .row { grid-template-columns: minmax(0, 1fr) 120px; gap: var(--sp-3); }
  .player { grid-column: 1; } .accepted { grid-column: 2; grid-row: 1 / 3; }
  .map { grid-column: 1; grid-row: 2; } .challenge { grid-column: 1 / -1; flex-wrap: wrap; }
}
</style>
