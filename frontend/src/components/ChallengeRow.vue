<script setup lang="ts">
/**
 * 一行挑战 —— 全站列表里挑战的唯一呈现方式。
 *
 * 左侧色脊取自该挑战的 Tier 颜色：一屏几十行铺下来，难度分布不用读字
 * 就能扫出来。右侧三列走固定槽位，长地图名只会挤压第一列，永远不会把
 * 徽章和人数推走 —— 这是全站硬约束，改列宽前先想清楚。
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { ratedTierColor } from "@shared/tiers";
import type { DifficultyCode, Submission } from "@shared/types";
import { recommendationStats } from "@/lib/stats";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import TierBadge from "@/components/TierBadge.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import RatioBar from "@/components/RatioBar.vue";

const props = defineProps<{
  challenge: { id: number; name: string; tier: DifficultyCode; clearCount: number; href: string; records: Submission[] };
  /** 扁平列表可展示所属地图的 Hist；分组列表在地图标题展示。 */
  histMapId?: number;
}>();

const { t } = useLanguage();
const { tierColors } = storeToRefs(useDisplayStore());

const rail = computed(() => props.challenge.tier === "undetermined"
  ? "var(--tier-undetermined)"
  : ratedTierColor(props.challenge.tier, tierColors.value));
const rec = computed(() => recommendationStats(props.challenge.records));

/* 推荐率：比例条与百分数并排一行。上下两行会让每一行挑战都高出约 10px；
   并排之后行高由徽章决定，一屏能多放三分之一的挑战。具体票数进 title 与
   aria-label，读屏软件仍然拿得到。 */
const recSegments = computed(() => (rec.value.total ? [
  { value: rec.value.percent ?? 0, color: "var(--ok-600)", label: t("recommendation.yes") },
  { value: 100 - (rec.value.percent ?? 0), color: "var(--danger-600)", label: t("recommendation.no") },
] : []));
const recTitle = computed(() => (rec.value.total
  ? t("recommendation.votes", { yes: rec.value.yes, total: rec.value.total })
  : t("recommendation.empty")));
</script>

<template>
  <li>
    <RouterLink :to="challenge.href" class="row" :style="{ '--row-rail': rail }">
      <span class="main">
        <strong class="title"><slot name="title">{{ challenge.name }}</slot></strong>
        <span v-if="$slots.sub" class="sub"><slot name="sub" /></span>
      </span>
      <span class="badges">
        <HistRatingBadge :map-id="histMapId" />
        <TierBadge :tier="challenge.tier" size="sm" />
      </span>
      <span class="clears">
        <b>{{ challenge.clearCount }}</b>
        <small>{{ t(challenge.clearCount === 1 ? "common.personUnit" : "common.peopleUnit") }}</small>
      </span>
      <div class="rec" :title="recTitle">
        <RatioBar size="sm" :segments="recSegments" />
        <span class="rec-text">{{ rec.total ? `${rec.percent}%` : "—" }}</span>
      </div>
    </RouterLink>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 148px var(--slot-count) 132px;
  align-items: center;
  gap: var(--sp-4);
  /* 纵向压到 8px：行高由 22px 的徽章决定，一屏因此多放约三分之一的挑战 */
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-4);
  border-left: var(--rail-w) solid var(--row-rail, var(--border-strong));
  color: var(--fg-secondary);
  transition: background-color var(--dur-fast) var(--ease);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .row:hover { background: var(--bg-raised); }
}
/* 颜色钉在 @media 外：触摸设备不匹配 (hover: hover)，
   否则手指按下去时全局的 a:hover 会把文字变成链接蓝。 */
.row:hover,
.row:active,
.row:focus { color: var(--fg-secondary); }
.row:active { background: var(--bg-raised); }
.row:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }

.main { display: grid; gap: 0; min-width: 0; }
.title {
  font-size: var(--fs-body);
  line-height: 1.35;
  font-weight: var(--fw-medium);
  color: var(--fg-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  font-size: var(--fs-micro);
  line-height: 1.35;
  color: var(--fg-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badges { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2); }

.clears { display: flex; align-items: baseline; justify-content: flex-end; gap: 3px; }
.clears b {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.clears small { font-size: var(--fs-micro); color: var(--fg-subtle); }

/* 比例条与百分数并排：条吃掉剩余宽度，数字右对齐成一列 */
.rec { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.rec > :first-child { flex: 1 1 auto; min-width: 0; }
.rec-text {
  flex: 0 0 auto;
  min-width: 3.2em;
  text-align: right;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--fg-secondary);
}

@media (max-width: 900px) {
  /* 窄屏先收掉推荐率：四列里信息密度最低的一个 */
  .row { grid-template-columns: minmax(0, 1fr) 148px var(--slot-count); }
  .rec { display: none; }
}
@media (max-width: 640px) {
  /* 用具名区域而不是逐项指定行列：Grid 的自动放置会先安置位置确定的项，
     混用两种写法时长地图名会被挤进 56px 的窄列里折成两行。 */
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "main   clears"
      "badges rec";
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }
  .main { grid-area: main; }
  .clears { grid-area: clears; }
  .badges { grid-area: badges; justify-content: flex-start; }
  /* 第二行本来就要为徽章存在，推荐率放进去不额外占高度，
     所以窄屏反而可以把它找回来（900px 那档是横向放不下才隐藏的）。 */
  .rec { grid-area: rec; display: flex; width: 108px; }
}

/* 英文的「人」单位比中文长，竖排才留得住固定的人数列宽。 */
:global(html[lang="en"]) .clears { flex-direction: column; align-items: flex-end; gap: 0; }
</style>
