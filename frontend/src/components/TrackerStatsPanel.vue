<script setup lang="ts">
/**
 * 愿望单条目下的游戏内数据统计。只读，不写回条目的手填字段。
 *
 * 排布跟着 CCT 游戏内覆盖层走：先说人在不在线、在哪个房间，再按玩家看惯的
 * 四行给当前房间的读数，然后是地图级汇总，最后把所有房间摊成一张可排序的表。
 * 数字由 shared 的 cct-projection 算好、cct-overlay 取值，这里不做统计。
 *
 * 两条不能靠调用方自觉的规矩：多设备／多存档只显示最近更新的一份、绝不相加；
 * 没有样本或没有路线一律留白并说明原因，不拿 0% 顶替「未练习」。
 */
import { computed } from "vue";
import type { CctProjection } from "@shared/tracker/cct-projection";
import { chapterOverlay, roomOverlay, roomTable } from "@shared/tracker/cct-overlay";
import { useLanguage } from "@/i18n";
import PanelBlock from "@/components/PanelBlock.vue";
import TrackerRoomTable from "@/components/TrackerRoomTable.vue";

export type TrackerSource = {
  /** 玩家给设备起的名字，不显示设备标识本身。 */
  deviceLabel: string;
  /** 已格式化好的时间，格式化留在调用方以免这里依赖时钟。 */
  syncedAt: string;
  /** 该 SID/面下共有几份设备或存档统计，>1 时说明未合并。 */
  datasetCount: number;
  totalDeaths: number | null;
  noGoldenBestDeaths: number | null;
};

/**
 * 实时状态。离线、或人在别的地图时也要显示，玩家据此判断这些数字新不新。
 * 设备名不在这里 —— 状态行里的同步来源已经写了是哪台机器。
 */
export type TrackerLive = {
  online: boolean;
  /** here=正在这张图；elsewhere=在别的图；menu=不在关卡内；unknown=这张图还没配对。 */
  where: "here" | "elsewhere" | "menu" | "unknown";
  room: string | null;
  holdingGolden: boolean | null;
  paused: boolean | null;
  cctAvailable: boolean;
  cctTrackingPaused: boolean | null;
};

const props = defineProps<{
  /** null 表示这张图还没有同步过统计。 */
  projection: CctProjection | null;
  source: TrackerSource | null;
  /** null 表示这个账户没有任何设备报过实时状态。 */
  live: TrackerLive | null;
}>();

const { t } = useLanguage();

/** where 与文案 key 一一对应，写成表以免把 key 拼成字符串后失去类型检查。 */
const whereLabel = {
  here: "tracker.live.here", elsewhere: "tracker.live.elsewhere",
  menu: "tracker.live.menu", unknown: "tracker.live.unknown",
} as const;

const percent = (rate: number | null) => (rate === null ? null : `${(rate * 100).toFixed(1)}%`);
const count = (value: number | null | undefined) => (value === null || value === undefined ? null : String(value));

const golden = computed(() => props.projection?.golden ?? null);
const chapter = computed(() => (props.projection ? chapterOverlay(props.projection) : null));
const rooms = computed(() => (props.projection ? roomTable(props.projection) : []));

// 只有人确实在这张图的某个房间里，才谈得上「当前房间」。
const here = computed(() => (props.live?.online && props.live.where === "here" ? props.live.room : null));
const overlay = computed(() => (here.value && props.projection ? roomOverlay(props.projection, here.value) : null));
const state = computed(() => (!props.live?.online ? "offline" : props.live.where === "here" ? "online" : "elsewhere"));

const figures = computed(() => [
  { label: t("tracker.runs"), value: count(chapter.value?.runs ?? null) },
  { label: t("tracker.goldenDeaths"), value: count(golden.value === null ? null : golden.value.routeDeaths) },
  { label: t("tracker.totalDeaths"), value: count(props.source?.totalDeaths ?? null) },
  { label: t("tracker.noGoldenBest"), value: count(props.source?.noGoldenBestDeaths ?? null) },
  { label: t("tracker.lastRoom"), value: props.projection?.lastGameplayRoom ?? null },
]);
</script>

<template>
  <PanelBlock :title="t('tracker.title')" variant="inset">
    <!-- 状态行：人在不在线在最前，同步来源与份数跟在后面。没有设备时整行不出现。 -->
    <p v-if="live" class="note">
      <span class="status" :data-state="state">
        <span class="dot" aria-hidden="true" />
        {{ live.online ? t(whereLabel[live.where]) : t("tracker.live.offline") }}
      </span>
      <span v-if="live.online && live.holdingGolden" class="golden">{{ t("tracker.live.holdingGolden") }}</span>
      <span v-if="live.online && live.paused">{{ t("tracker.live.paused") }}</span>
      <span v-if="live.online && !live.cctAvailable">{{ t("tracker.live.noCct") }}</span>
      <span v-if="live.online && live.cctTrackingPaused">{{ t("tracker.live.trackingPaused") }}</span>
      <span v-if="source" class="source">{{ t("tracker.source", { device: source.deviceLabel, when: source.syncedAt }) }}</span>
      <span v-if="source && source.datasetCount > 1">{{ t("tracker.multiDataset", { count: source.datasetCount - 1 }) }}</span>
    </p>

    <!-- 这张图一份统计都没有：只报状态，不摆一排空数字。判的是 source 而不是
         projection —— 本体存档那两个数字属于 source，还没同步 CCT 也照常显示。 -->
    <p v-if="!source" class="empty">{{ t("tracker.notSynced") }}</p>

    <template v-else>
      <section v-if="here" class="live">
        <div class="live-head">
          <span class="live-room">{{ overlay?.displayName ?? here }}</span>
          <span v-if="overlay?.position" class="live-position">
            {{ t("tracker.live.position", { index: overlay.position, total: overlay.routeLength ?? 0 }) }}
          </span>
        </div>
        <template v-if="overlay">
          <!-- 四格一律占位（display: contents 铺进同一张网格），少了哪个都会让整列错位。 -->
          <div class="live-rows">
            <div class="live-row">
              <span class="live-row-label">{{ t("tracker.streak") }}</span>
              <span class="live-row-value">{{ overlay.currentStreak }}</span>
              <span class="live-row-detail" />
              <span class="live-row-aside">({{ overlay.bestStreak }})</span>
            </div>
            <div class="live-row">
              <span class="live-row-label">{{ t("tracker.colWindowRate", { count: projection?.window ?? 0 }) }}</span>
              <span class="live-row-value" :class="{ 'figure-empty': percent(overlay.windowRate) === null }">{{ percent(overlay.windowRate) ?? "—" }}</span>
              <span class="live-row-detail">{{ overlay.windowSamples > 0 ? `[${overlay.windowSuccesses}/${overlay.windowSamples}]` : t("tracker.thin") }}</span>
              <span class="live-row-aside" />
            </div>
            <template v-if="overlay.golden">
              <div class="live-row">
                <span class="live-row-label">{{ t("tracker.goldenRate") }}</span>
                <span class="live-row-value" :class="{ 'figure-empty': percent(overlay.golden.successRate) === null }">{{ percent(overlay.golden.successRate) ?? "—" }}</span>
                <span class="live-row-detail">[{{ overlay.golden.successes }}/{{ overlay.golden.entries }}]</span>
                <span class="live-row-aside">{{ percent(overlay.goldenSession?.successRate ?? null) ? `(${percent(overlay.goldenSession?.successRate ?? null)})` : "" }}</span>
              </div>
              <div class="live-row">
                <span class="live-row-label">{{ t("tracker.entryChance") }}</span>
                <span class="live-row-value" :class="{ 'figure-empty': percent(overlay.golden.entryChance) === null }">{{ percent(overlay.golden.entryChance) ?? "—" }}</span>
                <span class="live-row-detail" />
                <span class="live-row-aside">{{ percent(overlay.goldenSession?.entryChance ?? null) ? `(${percent(overlay.goldenSession?.entryChance ?? null)})` : "" }}</span>
              </div>
              <div class="live-row">
                <span class="live-row-label">{{ t("tracker.run") }}</span>
                <span class="live-row-value">#{{ overlay.golden.runNumber }}</span>
                <span class="live-row-detail" />
                <span class="live-row-aside">{{ overlay.goldenSession ? `(#${overlay.goldenSession.runNumber})` : "" }}</span>
              </div>
            </template>
          </div>
          <p v-if="!overlay.golden" class="empty">{{ t("tracker.noRoute") }}</p>
        </template>
        <p v-else class="empty">{{ t("tracker.roomUnsynced") }}</p>
      </section>

      <div class="figures">
        <div v-for="figure in figures" :key="figure.label" class="figure">
          <span class="figure-label">{{ figure.label }}</span>
          <!-- 无数据不是 0：留白字形与真实数字明确区分。 -->
          <span class="figure-value" :class="{ 'figure-empty': figure.value === null }">{{ figure.value ?? "—" }}</span>
        </div>
      </div>

      <section class="section">
        <h3 class="section-title">
          {{ t("tracker.rooms") }}
          <span v-if="rooms.length" class="section-count">{{ rooms.length }}</span>
        </h3>
        <TrackerRoomTable v-if="projection" :rooms="rooms" :window="projection.window" />
        <p v-else class="empty">{{ t("tracker.roomsEmpty") }}</p>
      </section>

      <p class="disclaimer">{{ t("tracker.disclaimer") }}</p>
    </template>
  </PanelBlock>
</template>

<style scoped>
/* 只读投影的展示层：这里不做任何计算，数字一律由投影算好传进来。 */
.note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2) var(--sp-3);
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.source { font-variant-numeric: var(--num-tabular); }

/* 在线状态：一个点加一句话。颜色只区分在线与否，别的信息交给文字。 */
.status { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--fg-secondary); }
.dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--fg-disabled); }
.status[data-state="online"] .dot { background: var(--ok-400); }
.status[data-state="elsewhere"] .dot { background: var(--fg-subtle); }
.golden { color: var(--brand-mark); }

/* 当前房间：照搬游戏内覆盖层的读法，标签一列、读数一列。 */
.live { margin: 0 0 var(--sp-5); padding: var(--sp-3) 0; border-top: var(--hairline); border-bottom: var(--hairline); }
.live-head { display: flex; align-items: baseline; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.live-room { font-size: var(--fs-lead); color: var(--fg-default); overflow-wrap: anywhere; }
.live-position { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-size: var(--fs-sm); color: var(--fg-subtle); }

.live-rows { display: grid; grid-template-columns: auto auto auto 1fr; gap: var(--sp-1) var(--sp-3); align-items: baseline; }
.live-row { display: contents; }
.live-row-label { font-size: var(--fs-sm); color: var(--fg-subtle); }
.live-row-value { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-size: var(--fs-body); color: var(--fg-default); }
/* 分子分母与 session 读数都是佐证，不与主读数争视线。 */
.live-row-detail, .live-row-aside {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-sm);
  color: var(--fg-subtle);
}

/* 几个数字尽量排成一行：格子按最窄能读的宽度给，装不下才折。 */
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: var(--sp-4) var(--sp-3); margin-bottom: var(--sp-5); }
.figure { display: flex; flex-direction: column; gap: var(--sp-1); }
.figure-label { font-size: var(--fs-micro); color: var(--fg-subtle); white-space: nowrap; }
.figure-value { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-size: var(--fs-h2); color: var(--fg-default); }
.figure-empty { color: var(--fg-disabled); }

.section { margin-bottom: var(--sp-5); }
.section:last-child { margin-bottom: 0; }
.section-title {
  display: flex;
  align-items: baseline;
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--fg-subtle);
}
.section-count { margin-left: var(--sp-2); font-family: var(--font-num); font-variant-numeric: var(--num-tabular); color: var(--fg-disabled); }

.empty { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
.disclaimer {
  margin: var(--sp-5) 0 0;
  padding-top: var(--sp-3);
  border-top: var(--hairline);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
  line-height: var(--lh-body);
}
</style>
