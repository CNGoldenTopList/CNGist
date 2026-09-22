<script setup lang="ts">
/**
 * 炼金愿望单 —— 记录正在练习的挑战与进度。
 *
 * 这一页是一份清单，不是一叠表单：状态是页面的骨架（顶部按状态筛选、分组列出），
 * 一行一个挑战只留名字、进度与两个数字，展开才出现编辑与游戏内数据。
 *
 * 开着游戏时页首多一条实时条，正在练的那张图的条目默认展开 —— 打开页面就落在
 * 你正在练的东西上，不用先找。
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { NButton, NInput, NInputNumber, NRadioButton, NRadioGroup, NSlider } from "naive-ui";
import { storeToRefs } from "pinia";
import WishlistPingPoint from "@/components/WishlistPingPoint.vue";
import { isTierCode } from "@shared/tiers";
import { formatBeijingDateTime } from "@shared/datetime";
import { roomOverlay } from "@shared/tracker/cct-overlay";
import type { CctProjection } from "@shared/tracker/cct-projection";
import { api } from "@/lib/api";
import { catalogReady } from "@/lib/catalog";
import { challengeContext } from "@/lib/projection";
import { challengeHref } from "@/lib/routes";
import {
  fetchPlayerWishlist, patchWish, refreshWishlist, removeWish, wishlistEntries,
  type WishlistEntry, type WishlistStatus,
} from "@/lib/wishlist";
import { useLanguage, type MessageKey } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import LoadState from "@/components/LoadState.vue";
import RatioBar from "@/components/RatioBar.vue";
import TierBadge from "@/components/TierBadge.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import PlayerPresence from "@/components/PlayerPresence.vue";
import TrackerStatsPanel, { type TrackerLive } from "@/components/TrackerStatsPanel.vue";
import MapBindingPrompt from "@/components/MapBindingPrompt.vue";
import FormField from "@/components/FormField.vue";
import LinkButton from "@/components/LinkButton.vue";
import I18nMessage from "@/components/I18nMessage.vue";

type MapStats = {
  mapId: number; sid: string; side: string; deviceLabel: string; syncedAt: string | null;
  datasetCount: number; totalDeaths: number | null; noGoldenBestDeaths: number | null;
  projection: CctProjection | null;
};
type LiveObservation = {
  sid?: string | null; side?: string | null; room?: string | null;
  holdingGolden?: boolean | null; paused?: boolean | null;
  cctAvailable?: boolean; cctTrackingPaused?: boolean | null;
};
type LiveDevice = { deviceId: string; deviceName: string; updatedAt: string; online: boolean; observation: LiveObservation | null };

const statuses: Array<{ value: WishlistStatus; label: MessageKey }> = [
  { value: "active", label: "wishlist.statusActive" },
  { value: "soon", label: "wishlist.statusSoon" },
  { value: "later", label: "wishlist.statusLater" },
  { value: "archive", label: "wishlist.statusArchive" },
];

/** 停手多久才把改动发出去。拖一次进度条会触发几十个 change，不能一个一个发。 */
const SAVE_DELAY = 300;
/** 只留数字和冒号。小时位可以多于两位（100:00:00 就有 9 个字符），服务端存 32。 */
const sanitizeDuration = (value: string) => value.replace(/[^\d:]/g, "").slice(0, 12);

const route = useRoute();
const { t, apiError } = useLanguage();
const { account } = storeToRefs(useSessionStore());

const targetPlayerId = computed(() => (route.query.playerId ? Number(route.query.playerId) : undefined));
const targetChallengeId = computed(() => (route.query.challengeId ? Number(route.query.challengeId) : undefined));
const playerId = computed(() => targetPlayerId.value || account.value?.claimedPlayerId);
const isOwner = computed(() => Boolean(account.value && (!targetPlayerId.value || targetPlayerId.value === account.value.claimedPlayerId)));

/** null 表示还没取回来，与「一条都没有」不是一回事。 */
const rows = ref<WishlistEntry[] | null>(null);
const stats = ref<Record<number, MapStats>>({});
const filter = ref<WishlistStatus | "all">("all");
/** 手动展开／收起的覆盖值；没记录过的条目跟随「是不是正在练」。 */
const opened = ref<Record<number, boolean>>({});

/*
 * 写回是「本地先改，稍后合并发一次」。每个 change 都立刻 PATCH 的话，拖一下
 * 进度条就会发几十个请求、响应乱序回来，谁后到谁说了算，滑块于是跳回旧值。
 */
const pendingChanges = new Map<number, Partial<WishlistEntry>>();
let saveTimer = 0;

async function flush() {
  window.clearTimeout(saveTimer);
  const queued = [...pendingChanges];
  pendingChanges.clear();
  for (const [id, changes] of queued) {
    const result = await patchWish(id, changes);
    if (!result.ok) {
      toast.error(apiError(result.data, "wishlist.saveFailed"));
      // 写失败就把列表拉回服务端的真实内容 —— 界面不能留着一个没保存上的值。
      await load();
    }
  }
}

function patch(id: number, changes: Partial<WishlistEntry>) {
  if (!isOwner.value) return;
  rows.value = (rows.value ?? []).map((item) => (item.id === id ? { ...item, ...changes } : item));
  pendingChanges.set(id, { ...pendingChanges.get(id), ...changes });
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY);
}

async function remove(id: number) {
  if (!isOwner.value) return;
  // 都要删了，这条还没发出去的编辑就不必再发。
  pendingChanges.delete(id);
  rows.value = (rows.value ?? []).filter((item) => item.id !== id);
  const result = await removeWish(id);
  if (!result.ok) {
    toast.error(apiError(result.data, "wishlist.removeFailed"));
    await load();
  }
}

async function load() {
  if (targetPlayerId.value) {
    rows.value = await fetchPlayerWishlist(targetPlayerId.value);
    return;
  }
  if (!account.value) { rows.value = null; return; }
  await refreshWishlist();
  rows.value = [...wishlistEntries.value];
}

watch([account, targetPlayerId], () => { void load(); }, { immediate: true });

const views = computed(() => (rows.value ?? []).map((row) => ({ row, context: challengeContext(row.challengeId) })));

/* 深链到某一条：把筛选放开、展开它、滚到视野中间。 */
let focused = "";
watch([rows, catalogReady, targetChallengeId], async () => {
  if (!targetChallengeId.value || !rows.value || !catalogReady.value) return;
  const target = rows.value.find((row) => row.challengeId === targetChallengeId.value);
  if (!target || focused === `${playerId.value}:${targetChallengeId.value}`) return;
  focused = `${playerId.value}:${targetChallengeId.value}`;
  filter.value = "all";
  opened.value = { ...opened.value, [target.id]: true };
  await nextTick();
  document.getElementById(`wish-${target.id}`)?.scrollIntoView({ block: "center" });
});

/*
 * 统计按目录地图取。愿望单里的多地图挑战没有 mapId，自然也就没有统计。
 * 先算成一个字符串再拆回数组：每改一个字都是新数组，直接拿它当依赖会让
 * 取统计的请求跟着每一次拖动重发一遍。
 */
const mapKey = computed(() => [...new Set(views.value
  .map((item) => item.context.challenge?.mapId)
  .filter((id): id is number => Boolean(id)))].sort().join(" "));

const statsAge = ref(0);
watch([isOwner, mapKey, statsAge], async () => {
  const ids = mapKey.value ? mapKey.value.split(" ") : [];
  if (!isOwner.value || !ids.length) { stats.value = {}; return; }
  const query = ids.map((id) => `mapId=${id}`).join("&");
  const { ok, data } = await api.get<{ stats?: MapStats[] }>(`/api/tracker/stats?${query}`);
  if (ok) stats.value = Object.fromEntries((data.stats ?? []).map((item) => [item.mapId, item]));
}, { immediate: true });

/*
 * 实时状态按账户取，与地图无关：观测里带着 SID 与面，哪张图正在被玩由它对上
 * 统计的作用域决定。页面不可见时不轮询 —— 这个接口每次都要查库。
 */
const live = ref<LiveDevice | null>(null);
let liveTimer = 0;

async function loadLive() {
  if (document.visibilityState !== "visible") return;
  const { ok, data } = await api.get<{ devices?: LiveDevice[] }>("/api/tracker/presence");
  if (!ok) return;
  const devices = data.devices ?? [];
  // 一台设备都没授权就别再定时问了；授权是在别的页面完成的，回到这页会重新取一次。
  if (!devices.length) window.clearInterval(liveTimer);
  // 多设备只跟一台：优先在线的那台，都离线时取最近上报的一台（接口已按时间倒序）。
  live.value = devices.find((device) => device.online) ?? devices[0] ?? null;
}

function stopLive() {
  window.clearInterval(liveTimer);
  document.removeEventListener("visibilitychange", loadLive);
}

watch(isOwner, (owner) => {
  stopLive();
  live.value = null;
  if (!owner) return;
  void loadLive();
  liveTimer = window.setInterval(() => void loadLive(), 10_000);
  document.addEventListener("visibilitychange", loadLive);
}, { immediate: true });

const observation = computed(() => (live.value?.online ? live.value.observation : null));
const inGame = computed(() => Boolean(observation.value?.sid));

/** 人在游戏里的时候统计一直在变，进页面时取的那份很快就旧了。 */
let statsTimer = 0;
watch(inGame, (playing) => {
  window.clearInterval(statsTimer);
  if (!playing) return;
  statsTimer = window.setInterval(() => { statsAge.value += 1; }, 30_000);
}, { immediate: true });

onUnmounted(() => {
  stopLive();
  window.clearInterval(statsTimer);
  // 离开这一页时补发没发出去的改动。
  void flush();
});

/** 正在练的是哪张图：观测里的 SID/面先对上一份统计，再由它对上愿望单里的条目。 */
const liveStat = computed(() => (observation.value?.sid
  ? Object.values(stats.value).find((item) => item.sid === observation.value!.sid && item.side === observation.value!.side)
  : undefined));
const liveRoom = computed(() => (liveStat.value?.projection && observation.value?.room
  ? roomOverlay(liveStat.value.projection, observation.value.room)
  : null));

/**
 * 把账户级的实时状态落到某一张图上。没有配对（stat 为空）时不能说人在别处 ——
 * 那种情况下网站根本不知道 SID 对应哪张图，只能说在线。
 */
function liveFor(stat: MapStats | undefined): TrackerLive | null {
  if (!live.value) return null;
  const here = Boolean(stat && observation.value?.sid === stat.sid && observation.value?.side === stat.side);
  const where = here ? "here" : !observation.value?.sid ? "menu" : stat ? "elsewhere" : "unknown";
  return {
    online: live.value.online,
    where,
    room: here ? observation.value?.room ?? null : null,
    holdingGolden: observation.value?.holdingGolden ?? null,
    paused: observation.value?.paused ?? null,
    cctAvailable: observation.value?.cctAvailable ?? false,
    cctTrackingPaused: observation.value?.cctTrackingPaused ?? null,
  };
}

const counts = computed(() => statuses.map((status) => views.value.filter((item) => item.row.status === status.value).length));
const shown = computed(() => (filter.value === "all" ? views.value : views.value.filter((item) => item.row.status === filter.value)));
const groups = computed(() => (filter.value === "all"
  ? statuses
    .map((status, index) => ({ status, count: counts.value[index], items: views.value.filter((item) => item.row.status === status.value) }))
    .filter((group) => group.items.length > 0)
  : [{ status: statuses.find((item) => item.value === filter.value)!, count: shown.value.length, items: shown.value }]));

type View = (typeof views.value)[number];
const statFor = (view: View) => (view.context.challenge?.mapId ? stats.value[view.context.challenge.mapId] : undefined);
const hereFor = (view: View) => Boolean(liveStat.value && view.context.challenge?.mapId === liveStat.value.mapId);
const isOpen = (view: View) => opened.value[view.row.id] ?? hereFor(view);
const toggleOpen = (view: View) => { opened.value = { ...opened.value, [view.row.id]: !isOpen(view) }; };
const tierOf = (view: View) => view.context.challenge?.tier ?? view.context.multiChallenge?.tier;
const mapNameOf = (view: View) => view.context.map?.name || view.context.campaign?.name || "";
const challengeNameOf = (view: View) => view.context.challenge?.name || view.context.multiChallenge?.name || "";
const targetHref = (view: View) => (view.context.challenge
  ? challengeHref(view.row.challengeId, view.context.challenge.mapId)
  : `/multi-challenge/${view.row.challengeId}`);

const sourceFor = (stat: MapStats | undefined) => (stat ? {
  deviceLabel: stat.deviceLabel,
  syncedAt: formatBeijingDateTime(stat.syncedAt ?? undefined),
  datasetCount: stat.datasetCount,
  totalDeaths: stat.totalDeaths,
  noGoldenBestDeaths: stat.noGoldenBestDeaths,
} : null);

const filterOptions = computed(() => [
  { value: "all" as const, label: `${t("wishlist.filterAll")} ${views.value.length}` },
  ...statuses.map((status, index) => ({ value: status.value, label: `${t(status.label)} ${counts.value[index]}` })),
]);
</script>

<template>
  <PageShell
    class="wishlist-page"
    :eyebrow="t('player.wishlist')"
    :title="t('wishlist.title')"
    :lede="isOwner ? t('wishlist.lede') : undefined"
    width="wide"
  >
    <template v-if="playerId" #actions>
      <LinkButton :to="`/player/${playerId}`" quaternary>{{ t("wishlist.back") }}</LinkButton>
    </template>

    <p v-if="!account && !targetPlayerId" class="gate">
      <span class="gate-mark" aria-hidden="true" />
      <I18nMessage id="wishlist.gate">
        <template #link><RouterLink to="/account">{{ t("nav.account") }}</RouterLink></template>
      </I18nMessage>
    </p>

    <!-- 目录没到位时挑战名是空的，宁可等一下，也不要先摆出一排没有名字的行。 -->
    <LoadState v-else-if="rows === null || !catalogReady" :label="t('wishlist.loading')" />

    <template v-else>
      <PlayerPresence
        v-if="playerId"
        :player-id="playerId"
        :is-owner="isOwner"
        :room="liveRoom?.displayName ?? observation?.room"
        :position="liveRoom?.position ? t('tracker.live.position', { index: liveRoom.position, total: liveRoom.routeLength ?? 0 }) : null"
        :run-number="liveRoom?.golden?.runNumber"
        :holding-golden="observation?.holdingGolden"
      />

      <!-- 一条都没有时不摆筛选器：那时唯一该说的是「怎么加第一条」。 -->
      <p v-if="!views.length" class="empty">{{ t("wishlist.empty") }}</p>
      <template v-else>
        <NRadioGroup v-model:value="filter" size="small" :aria-label="t('wishlist.filterLabel')">
          <NRadioButton v-for="option in filterOptions" :key="option.value" :value="option.value">{{ option.label }}</NRadioButton>
        </NRadioGroup>

        <p v-if="!shown.length" class="empty">{{ t("wishlist.emptyFilter") }}</p>
        <section v-for="group in groups" v-else :key="group.status.value" class="group">
          <h2 v-if="filter === 'all'" class="group-title">
            {{ t(group.status.label) }}
            <span class="group-count">{{ group.count }}</span>
          </h2>
          <ul class="entries">
            <li v-for="view in group.items" :id="`wish-${view.row.id}`" :key="view.row.id" class="entry">
              <div class="summary">
                <!-- 整行都是展开开关：按钮铺一层透明覆盖面，行里其余元素不抢点击。 -->
                <button
                  type="button"
                  class="disclosure"
                  :aria-expanded="isOpen(view)"
                  :aria-controls="`wish-${view.row.id}-detail`"
                  @click="toggleOpen(view)"
                >
                  <span class="caret" :class="{ 'caret-open': isOpen(view) }" aria-hidden="true" />
                  <span class="name">
                    <span class="map-name">{{ mapNameOf(view) }}</span>
                    <span class="challenge-name">{{ challengeNameOf(view) }}</span>
                  </span>
                </button>

                <span class="tier">
                  <HistRatingBadge v-if="view.context.map && view.context.challenge" :map-id="view.context.map.id" />
                  <TierBadge v-if="tierOf(view)" :tier="tierOf(view)!" size="sm" />
                </span>

                <span class="meter">
                  <!-- 百分比就写在旁边，条本身不必再被读一遍。 -->
                  <span class="meter-track" aria-hidden="true">
                    <RatioBar
                      size="sm"
                      :segments="[
                        { value: view.row.progress, color: 'var(--accent-600)', label: t('wishlist.progressLabel') },
                        { value: 100 - view.row.progress, color: 'transparent', label: '' },
                      ]"
                    />
                  </span>
                  <span class="percent">{{ view.row.progress }}%</span>
                </span>

                <span class="stat deaths">
                  <span class="stat-label">{{ t("wishlist.bestDeathsShort") }}</span>
                  <template v-if="view.row.bestDeaths != null">{{ view.row.bestDeaths }}</template>
                  <span v-else class="none">—</span>
                </span>
                <span class="stat time">
                  <span class="stat-label">{{ t("wishlist.durationShort") }}</span>
                  <template v-if="view.row.practiceDuration">{{ view.row.practiceDuration }}</template>
                  <span v-else class="none">—</span>
                </span>

                <span class="here-slot">
                  <span v-if="hereFor(view)" class="here">{{ t("wishlist.liveNow") }}</span>
                </span>
              </div>

              <div v-if="isOpen(view)" :id="`wish-${view.row.id}-detail`" class="detail">
                <div v-if="isOwner" class="fields">
                  <FormField :label="t('wishlist.statusLabel')">
                    <NRadioGroup
                      :value="view.row.status"
                      size="small"
                      :aria-label="t('wishlist.statusLabel')"
                      @update:value="(value: WishlistStatus) => patch(view.row.id, { status: value })"
                    >
                      <NRadioButton v-for="status in statuses" :key="status.value" :value="status.value">{{ t(status.label) }}</NRadioButton>
                    </NRadioGroup>
                  </FormField>

                  <FormField :label="t('wishlist.progress', { percent: view.row.progress })">
                    <NSlider
                      :value="view.row.progress"
                      :min="0"
                      :max="100"
                      :aria-label="t('wishlist.progressLabel')"
                      @update:value="(value: number) => patch(view.row.id, { progress: value })"
                    />
                  </FormField>

                  <FormField :label="t('wishlist.bestDeaths')">
                    <NInputNumber
                      :value="view.row.bestDeaths ?? null"
                      :min="0"
                      class="full"
                      @update:value="(value: number | null) => patch(view.row.id, { bestDeaths: value })"
                    />
                  </FormField>

                  <FormField :label="t('wishlist.duration')" hint="hh:mm:ss">
                    <NInput
                      :value="view.row.practiceDuration ?? ''"
                      placeholder="01:23:45"
                      @update:value="(value: string) => patch(view.row.id, { practiceDuration: sanitizeDuration(value) })"
                    />
                  </FormField>

                  <FormField :label="t('wishlist.comment')" wide>
                    <NInput
                      :value="view.row.comment ?? ''"
                      type="textarea"
                      :rows="2"
                      @update:value="(value: string) => patch(view.row.id, { comment: value })"
                    />
                  </FormField>
                </div>
                <p v-else class="read-comment">{{ view.row.comment || "—" }}</p>

                <TrackerStatsPanel
                  v-if="isOwner && view.context.challenge?.mapId"
                  :projection="statFor(view)?.projection ?? null"
                  :live="liveFor(statFor(view))"
                  :source="sourceFor(statFor(view))"
                >
                  <template #ping>
                    <WishlistPingPoint v-if="isTierCode(tierOf(view))" :wish-id="view.row.id" />
                  </template>
                </TrackerStatsPanel>

                <div class="entry-actions">
                  <LinkButton :to="targetHref(view)" quaternary size="small">{{ t("wishlist.openChallenge") }}</LinkButton>
                  <NButton v-if="isOwner" type="error" size="small" @click="remove(view.row.id)">{{ t("wishlist.remove") }}</NButton>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>

      <MapBindingPrompt v-if="isOwner" />
    </template>
  </PageShell>
</template>

<style scoped>
/**
 * 行是这一页的基本单位：名字吃剩余宽度，Tier、进度、死亡、时长各占固定槽位，
 * 十几行叠起来时数字仍然是对齐的一列，扫得下来。展开区在行下方沉出一档地面。
 */
.gate {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--danger-500);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--fs-body);
  color: var(--fg-secondary);
}
.gate-mark { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--danger-400); }

.wishlist-page { grid-template-columns: minmax(0, 1fr); }
.wishlist-page :deep(.n-radio-group) { max-width: 100%; height: auto; min-height: calc(var(--n-height) + 4px); overflow-x: auto; overflow-y: hidden; padding-block: 2px; }
.group { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: var(--sp-2); }
.group-title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  margin: 0;
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  color: var(--fg-secondary);
}
.group-count { font-family: var(--font-num); font-size: var(--fs-sm); color: var(--fg-subtle); }

.entries { margin: 0; padding: 0; list-style: none; }
.entry { border-top: var(--hairline); }
.entry:last-child { border-bottom: var(--hairline); }

.summary {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content 170px 5.5em 7em auto;
  grid-template-areas: "name tier meter deaths time here";
  align-items: center;
  gap: var(--sp-3);
  transition: background-color var(--dur-fast) var(--ease);
}
@media (hover: hover) {
  .summary:hover { background: var(--bg-surface); }
}

.disclosure {
  grid-area: name;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3) 0;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.disclosure::after { content: ""; position: absolute; inset: 0; }
.disclosure:focus-visible { outline: none; }
.disclosure:focus-visible::after { outline: 2px solid var(--border-focus); outline-offset: -2px; border-radius: var(--r-sm); }

.caret {
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border: 5px solid transparent;
  border-left-color: var(--fg-subtle);
  border-right-width: 0;
  transition: transform var(--dur-fast) var(--ease);
}
.caret-open { transform: rotate(90deg); }

.name { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
.map-name { color: var(--fg-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 挑战后缀用正文色，与地图名拉开层次 —— 全站硬约束 */
.challenge-name { font-weight: var(--fw-normal); color: var(--fg-muted); white-space: nowrap; }

.tier { grid-area: tier; display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); }
.meter { grid-area: meter; display: flex; align-items: center; gap: var(--sp-2); }
.meter-track { flex: 1 1 auto; min-width: 48px; }
.percent {
  flex: 0 0 3.5ch;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  text-align: right;
}

.stat {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  text-align: right;
  white-space: nowrap;
}
.deaths { grid-area: deaths; }
.time { grid-area: time; }
.stat-label { margin-right: var(--sp-2); font-family: var(--font-body); font-size: var(--fs-micro); color: var(--fg-subtle); }
.none { color: var(--fg-disabled); }

.here-slot { grid-area: here; display: flex; justify-content: flex-end; }
.here {
  padding: 2px var(--sp-2);
  border-radius: var(--r-pill);
  background: var(--bg-raised);
  font-size: var(--fs-micro);
  color: var(--ok-400);
  white-space: nowrap;
}

.detail { padding: var(--sp-4); background: var(--bg-surface); border-radius: var(--r-md); margin-bottom: var(--sp-3); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
.read-comment { margin: 0 0 var(--sp-4); font-size: var(--fs-body); color: var(--fg-secondary); }
.full { width: 100%; }

.entry-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: var(--hairline);
}

.empty { margin: 0; padding: var(--sp-7) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }

/* 窄屏：名字独占一行，进度与两个数字排到第二行，仍各自对齐。 */
@media (max-width: 820px) {
  .summary {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "name here tier"
      "meter deaths time";
    row-gap: 0;
    padding-bottom: var(--sp-3);
  }
  .disclosure { padding-bottom: var(--sp-1); }
  .stat { text-align: right; }
}
</style>
