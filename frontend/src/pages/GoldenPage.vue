<script setup lang="ts">
/**
 * 金榜矩阵 —— 这个站的核心页面。
 *
 * 横向按 Tier 分列、纵向按难度递减排列，每格是一个挑战。格子底色就是该
 * 挑战的难度色，因此整块矩阵本身就是一张难度地图。这是全站唯一让 17 档
 * Tier 色大面积铺开的地方，也是其余部分必须保持中性的原因。
 *
 * 这一页不套 PageShell：矩阵要铺满视口宽度，而那三档宽度都会给它加上限。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NRadioButton, NRadioGroup } from "naive-ui";
import { storeToRefs } from "pinia";
import { isTierCode, tierGroups, tierIndex, tierMeta, tierOrder } from "@shared/tiers";
import { challengeDisplayName } from "@shared/labels";
import type { TierCode } from "@shared/types";
import { catalog, catalogReady } from "@/lib/catalog";
import { clearCount } from "@/lib/projection";
import { challengeHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import { resolveChineseName } from "@/lib/names";
import LoadState from "@/components/LoadState.vue";
import TierRangeSlider from "@/components/TierRangeSlider.vue";

type TieredEntry = {
  id: number; tier: TierCode; name: string; cnName?: string; aliases?: string[];
  challengeName: string; clearCount: number; href: string;
};

const GOLDEN_VIEW_KEY = "cn-golden-matrix-view-v1";

const { t } = useLanguage();
const { nameMode, onlyOfficialChinese, compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

const lower = ref(0);
const upper = ref(tierOrder.length - 1);
const detailed = ref(false);
const showTierControls = ref(true);
const hasOverflow = ref(false);

const scroller = ref<HTMLElement | null>(null);
const stickyTrack = ref<HTMLElement | null>(null);
const rail = ref<HTMLInputElement | null>(null);

/* 这份矩阵很重（几千格），首屏先把控件和占位画出来，下一帧再算。 */
const ready = shallowRef(false);
requestAnimationFrame(() => { ready.value = true; });

function readView() {
  try { return JSON.parse(window.sessionStorage.getItem(GOLDEN_VIEW_KEY) || "{}") as Record<string, unknown>; }
  catch { return {}; }
}
function writeView(patch: Record<string, unknown>) {
  try { window.sessionStorage.setItem(GOLDEN_VIEW_KEY, JSON.stringify({ ...readView(), ...patch })); }
  catch { /* 隐私模式下视图状态只在本次会话里有效 */ }
}

const saved = readView();
if (typeof saved.lower === "number") lower.value = saved.lower;
if (typeof saved.upper === "number") upper.value = saved.upper;
if (typeof saved.detailed === "boolean") detailed.value = saved.detailed;
if (typeof saved.showTierControls === "boolean") showTierControls.value = saved.showTierControls;

watch([lower, upper, detailed, showTierControls], () => {
  writeView({ lower: lower.value, upper: upper.value, detailed: detailed.value, showTierControls: showTierControls.value });
});

const tieredChallenges = computed<TieredEntry[]>(() => {
  const { campaigns, maps, challenges, multiMapChallenges } = catalog.value;
  return [
    ...challenges.filter((challenge) => isTierCode(challenge.tier)).flatMap((challenge) => {
      const map = maps.find((item) => item.id === challenge.mapId);
      return map ? [{
        id: challenge.id, tier: challenge.tier as TierCode, name: map.name, cnName: map.cnName,
        aliases: map.searchAliases, challengeName: challengeDisplayName(challenge),
        clearCount: clearCount(challenge.id), href: challengeHref(challenge.id, map.id),
      }] : [];
    }),
    ...multiMapChallenges.filter((challenge) => isTierCode(challenge.tier)).map((challenge) => {
      const campaign = campaigns.find((item) => item.id === challenge.campaignId);
      return {
        id: challenge.id, tier: challenge.tier as TierCode, name: campaign?.name || t("common.multiChallenge"),
        cnName: campaign?.cnName, aliases: campaign?.searchAliases, challengeName: challenge.name,
        clearCount: clearCount(challenge.id), href: `/multi-challenge/${challenge.id}`,
      };
    }),
  ];
});

const visible = computed(() => tieredChallenges.value.filter((challenge) => {
  const index = tierIndex(challenge.tier);
  return challenge.clearCount > 0 && index >= lower.value && index <= upper.value;
}));

const grouped = computed(() => {
  if (!ready.value || !catalogReady.value) return [];
  return tierGroups.flatMap((group) => {
    const items = visible.value
      .filter((challenge) => tierMeta[challenge.tier].group === group)
      .sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier)
        || a.name.localeCompare(b.name, "en", { sensitivity: "base" })
        || a.challengeName.localeCompare(b.challengeName, "en", { sensitivity: "base" }));
    return items.length ? [{ group, items, headerTier: items[0].tier }] : [];
  });
});

const columnWidth = computed(() => (detailed.value ? 430 : 338));
const term = computed(() => (compactTierLabels.value ? "T" : "Tier"));
const groupLabel = (group: string) => (compactTierLabels.value ? group.replace(/Tier\s*/, "T") : group);

/** High / Mid / Low 的分界标签。整数档（T-1、T4–T7）没有子档。 */
function subTierLabel(tier: TierCode) {
  const meta = tierMeta[tier];
  if (meta.level < 0 || meta.level > 3) return null;
  return `${meta.sub === 0 ? "High" : meta.sub === 1 ? "Mid" : "Low"} T${meta.level}`;
}

/** 每格要不要画子档分隔：本列里这一档的第一格才画。 */
const markerFor = (items: TieredEntry[], index: number) => {
  const marker = subTierLabel(items[index].tier);
  const previous = items[index - 1];
  return marker && (!previous || previous.tier !== items[index].tier) ? marker : null;
};

const cellName = (challenge: TieredEntry) => {
  const cn = resolveChineseName(challenge.name, challenge.cnName, challenge.aliases, onlyOfficialChinese.value);
  return {
    main: nameMode.value === "cn" && cn ? cn : challenge.name,
    cn: nameMode.value === "both" && cn ? cn : "",
  };
};

/* ── 横向滚动：粘性表头、底部拖动条与方向键翻列 ────────────────
   表头与拖动条都是滚动区的镜像，靠一次 rAF 同步，避免滚动时逐帧布局。 */
let scrollFrame: number | null = null;
let railFrame: number | null = null;
let observer: ResizeObserver | null = null;

function syncHorizontal() {
  const el = scroller.value;
  if (!el) return;
  const left = el.scrollLeft;
  if (rail.value) rail.value.value = String(Math.min(Math.round(left), Number(rail.value.max) || 1));
  if (stickyTrack.value) stickyTrack.value.style.transform = `translate3d(${-left}px,0,0)`;
  writeView({ left, top: window.scrollY });
}

function measure() {
  const el = scroller.value;
  if (!el) return;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  if (rail.value) {
    rail.value.max = String(Math.max(1, Math.round(max)));
    rail.value.value = String(Math.min(Math.round(el.scrollLeft), Math.round(max)));
  }
  hasOverflow.value = max > 4;
  syncHorizontal();
}

function onScroll() {
  if (scrollFrame !== null) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = null; syncHorizontal(); });
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  scroller.value?.scrollBy({ left: event.key === "ArrowLeft" ? -columnWidth.value : columnWidth.value, behavior: "smooth" });
}

function onRailInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (railFrame !== null) cancelAnimationFrame(railFrame);
  railFrame = requestAnimationFrame(() => {
    if (scroller.value) scroller.value.scrollLeft = value;
    railFrame = null;
  });
}

/** 回到这一页时把两轴都放回原位 —— 从矩阵点进一条记录再返回是最常见的路径。 */
function restore() {
  const el = scroller.value;
  if (!el) return;
  const position = readView();
  if (typeof position.left === "number") el.scrollLeft = position.left;
  if (typeof position.top === "number") window.scrollTo({ top: position.top });
  syncHorizontal();
}

onMounted(() => {
  window.addEventListener("resize", measure);
  window.addEventListener("keydown", onKey);
  window.addEventListener("pageshow", restore);
});

/* 列数或列宽一变就要重新量：滚动范围跟着变了。 */
watch([() => grouped.value.length, columnWidth], async () => {
  await nextTick();
  const el = scroller.value;
  if (!el) return;
  observer?.disconnect();
  el.removeEventListener("scroll", onScroll);
  el.addEventListener("scroll", onScroll, { passive: true });
  observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
  observer?.observe(el);
  measure();
  restore();
}, { flush: "post" });

onBeforeUnmount(() => {
  writeView({ left: scroller.value?.scrollLeft ?? 0, top: window.scrollY });
  scroller.value?.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", measure);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pageshow", restore);
  observer?.disconnect();
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  if (railFrame !== null) cancelAnimationFrame(railFrame);
});

const nameMatrix = computed(() => detailed.value);
</script>

<template>
  <div class="page">
    <!-- 页面标题对读屏软件可见，视觉上由粘性表头承担 -->
    <h1 class="sr-only">{{ t("nav.golden") }}</h1>

    <div class="shell" :class="{ detailed: nameMatrix }">
      <!-- 控件条与矩阵同宽同心。滑块独占一行铺满宽度，视图开关在下一行正中 ——
           让它靠右会把整条控件的重心拉偏。 -->
      <div class="controls">
        <template v-if="showTierControls">
          <div class="slider">
            <span class="control-label">{{ t("common.tierRange", { term }) }}</span>
            <TierRangeSlider v-model:lower="lower" v-model:upper="upper" />
          </div>
          <div class="option-row">
            <!-- 「显示全名」是唯一的视图选项：关闭时地图名最多两行，打开后完整展开。 -->
            <div class="option-center">
              <NRadioGroup :value="detailed ? 'full' : 'clamp'" size="small" :aria-label="t('golden.nameDisplay')" @update:value="(value: string) => detailed = value === 'full'">
                <NRadioButton value="clamp">{{ t("golden.compact") }}</NRadioButton>
                <NRadioButton value="full">{{ t("golden.full") }}</NRadioButton>
              </NRadioGroup>
            </div>
            <!-- 单独占住右侧一格，因此不参与上面那格的居中 -->
            <div class="option-end">
              <NButton size="small" quaternary @click="showTierControls = false">{{ t("golden.hideFilters") }}</NButton>
            </div>
          </div>
        </template>
        <div v-else class="option-center">
          <NButton size="small" quaternary @click="showTierControls = true">{{ t("golden.showFilters", { term }) }}</NButton>
        </div>
      </div>

      <LoadState v-if="!ready || !catalogReady" :label="t('golden.loading')" />
      <template v-else>
        <!-- 粘性表头是滚动区的镜像：跟着横向滚动，但不参与纵向滚动 -->
        <div class="sticky-viewport" aria-hidden="true">
          <div
            ref="stickyTrack"
            class="sticky-track"
            :style="{ gridTemplateColumns: `repeat(${grouped.length}, ${columnWidth}px)`, width: `${grouped.length * columnWidth}px` }"
          >
            <div v-for="{ group, headerTier } in grouped" :key="group" class="sticky-cell" :style="{ '--tier': tierColors[headerTier] }">
              <strong>{{ groupLabel(group) }}</strong>
            </div>
          </div>
        </div>

        <section ref="scroller" class="scroller" :aria-label="t('golden.list')">
          <div class="matrix" :style="{ gridTemplateColumns: `repeat(${grouped.length}, ${columnWidth}px)` }">
            <div v-for="{ group, items, headerTier } in grouped" :key="group" class="column">
              <!-- 窄屏时列纵向堆叠，这个标题代替粘性表头 -->
              <div class="mobile-heading" :style="{ '--tier': tierColors[headerTier] }">{{ groupLabel(group) }}</div>
              <div class="rows">
                <div v-for="(challenge, index) in items" :key="challenge.id">
                  <div v-if="markerFor(items, index)" class="sub-tier" :data-first="index === 0 || undefined">
                    <span>{{ compactTierLabels ? markerFor(items, index) : markerFor(items, index)!.replace(/T(\d)/, "Tier $1") }}</span>
                  </div>
                  <RouterLink
                    :to="challenge.href"
                    class="cell"
                    :style="{ '--tier': tierColors[challenge.tier] }"
                    :title="`${challenge.name} [${challenge.challengeName}]`"
                  >
                    <span class="cell-name">
                      <strong>{{ cellName(challenge).main }}</strong>
                      <span v-if="cellName(challenge).cn" class="cell-cn">{{ cellName(challenge).cn }}</span>
                    </span>
                    <span class="cell-challenge">{{ challenge.challengeName }}</span>
                    <span class="cell-count">
                      <b>{{ challenge.clearCount }}</b>
                      <small>{{ t(challenge.clearCount === 1 ? "common.personUnit" : "common.peopleUnit") }}</small>
                    </span>
                  </RouterLink>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- 底部横向拖动条：矩阵比屏幕宽得多，原生滚动条在触摸板上够用，
           但鼠标用户需要一个可拖动的把手。 -->
      <div class="rail" :data-visible="hasOverflow || undefined">
        <input ref="rail" type="range" :min="0" :max="1" :value="0" :aria-label="t('golden.scroll')" @input="onRailInput" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/**
 * 金榜整页用更深的画布，让 17 档难度色的饱和度拉满。
 * 这是全站唯一一处刻意与其余页面地面色不同的地方。
 */
.page { background: var(--bg-page); padding-block: var(--sp-4) var(--sp-6); min-height: 70vh; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.shell { display: grid; gap: var(--sp-3); min-width: 0; }

/* ── 顶部控件：与矩阵同宽同心。 ── */
.controls {
  display: grid;
  gap: var(--sp-3);
  width: min(1100px, 100%);
  margin-inline: auto;
  padding: var(--sp-2) var(--sp-4);
}
/* 滑块吃满整行宽度：档位之间的距离越大，拖动越好落点 */
.slider { display: grid; gap: var(--sp-2); min-width: 0; }

/* 三格：左侧留白、正中开关、右侧「隐藏筛选」。把两个控件并排居中会让
   开关偏移半个按钮的宽度，所以让「隐藏筛选」单独占住右格。 */
.option-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--sp-3); }
.option-center { grid-column: 2; justify-self: center; }
/* 筛选收起时只剩这一个按钮，它不在三格网格里，需要自己居中 */
.controls > .option-center { grid-column: 1; }
.option-end { grid-column: 3; justify-self: end; }
.control-label { font-family: var(--font-num); font-size: var(--fs-micro); letter-spacing: .1em; color: var(--fg-subtle); }

/* ── 粘性表头：跟着横向滚动，不参与纵向滚动。高度固定，吸顶时不会
     把下面的内容顶得跳动。 ── */
.sticky-viewport {
  position: sticky;
  top: 64px;
  z-index: 12;
  overflow: hidden;
  background: var(--bg-page);
  padding-inline: var(--sp-4);
  /* 与 .scroller 用同一套对齐，否则矩阵居中后表头会错位 */
  display: flex;
  justify-content: safe center;
}
.sticky-track { flex: 0 0 auto; display: grid; gap: 2px; }
.sticky-cell {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm) var(--r-sm) 0 0;
  /* 深色画布里掺 30% 难度色：既标出这一列是哪一档，又不会亮到
     与下面真正的彩色格子混为一谈。 */
  background: color-mix(in srgb, var(--bg-page) 70%, var(--tier) 30%);
  box-shadow: inset 3px 0 0 var(--tier);
  color: var(--fg-default);
}
.sticky-cell strong { font-family: var(--font-title); font-size: var(--fs-body); font-weight: var(--fw-bold); letter-spacing: -.01em; }

/* ── 矩阵 ────────────────────────────────────────────────── */
.scroller {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  /* 列没铺满视口时整块矩阵居中，铺满后从左开始 —— 这是硬约束。
     safe 关键字保证溢出时退回 start，不会把左边裁掉。 */
  display: flex;
  justify-content: safe center;
  padding-inline: var(--sp-4);
  padding-bottom: var(--sp-3);
  background: var(--bg-page);
}
.matrix { display: grid; gap: 2px; min-width: max-content; flex: 0 0 auto; }
.column { display: grid; align-content: start; min-width: 0; }
.rows { display: grid; gap: 2px; }
.mobile-heading { display: none; }

/* 一个格子。紧凑模式下 52px，够放两行地图名 + 一行挑战名 ——
   这一页存在的意义就是纵览，格子越矮一屏看到的越多。 */
.cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "name  count"
    "chall count";
  align-items: center;
  gap: 0 var(--sp-2);
  min-height: 52px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--tier, var(--n-200));
  color: #17202a;
  transition: filter var(--dur-fast) var(--ease);
  -webkit-tap-highlight-color: transparent;
}
/* 格子本身是个 <a>，全局的 a:hover 特异度压过 .cell，交互时地图名会变成
   链接蓝 —— 在 17 种难度底色上那个蓝要么刺眼要么看不清。颜色必须钉在
   @media 外面：触摸设备不匹配 (hover: hover)，钉在里面等于只修了桌面端。 */
.cell:hover,
.cell:active,
.cell:focus { color: #17202a; }

/* 反馈统一用提亮：它是相对当前底色算的，任何配色下都成立 */
@media (hover: hover) {
  .cell:hover { filter: brightness(1.14); }
}
.cell:active { filter: brightness(1.14); }
.cell:focus-visible { outline: 2px solid #17202a; outline-offset: -3px; }

.cell-name { grid-area: name; min-width: 0; display: grid; }
.cell-name strong {
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  line-height: 1.25;
  /* 长地图名最多两行，第三行开始省略 —— 保持每格等高，矩阵才对得齐 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cell-cn { font-size: var(--fs-micro); line-height: 1.3; opacity: .78; }

.cell-challenge {
  grid-area: chall;
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  opacity: .72;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-count { grid-area: count; display: flex; align-items: baseline; gap: 1px; }
.cell-count b {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-lead);
  font-weight: var(--fw-bold);
  line-height: 1;
}
.cell-count small { font-size: 9px; opacity: .7; }

/* 显示全名：不再截断，格子高度随内容 */
.detailed .cell { min-height: 0; }
.detailed .cell-name strong { -webkit-line-clamp: unset; overflow: visible; }
.detailed .cell-challenge { white-space: normal; }

/* ── 子档分隔：列内的次级刻度，只用一条细线加一个小标签，不占用颜色。 ── */
.sub-tier {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-1) var(--sp-1);
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  letter-spacing: .08em;
  color: var(--fg-subtle);
}
.sub-tier[data-first] { padding-top: var(--sp-1); }
.sub-tier::after { content: ""; flex: 1 1 auto; height: 1px; background: var(--border-default); }

/* ── 底部拖动条 ──────────────────────────────────────────── */
.rail {
  position: sticky;
  bottom: 0;
  z-index: 12;
  padding: var(--sp-2) var(--sp-4);
  background: var(--bg-page);
  visibility: hidden;
}
.rail[data-visible] { visibility: visible; }
/* 这是滚动条，不是进度条：轨道不填充，把手是一段可拖动的胶囊。
   原生 range 默认把左侧填成实色，那读起来像「已完成 40%」，
   而这里表达的是「当前视口在整幅矩阵中的位置」。 */
.rail input {
  width: 100%;
  height: 14px;
  margin: 0;
  background: transparent;
  cursor: grab;
  -webkit-appearance: none;
  appearance: none;
}
.rail input:active { cursor: grabbing; }
.rail input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 3px; border-radius: var(--r-pill); }

.rail input::-webkit-slider-runnable-track { height: 8px; border-radius: var(--r-pill); background: var(--bg-overlay); }
.rail input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 96px;
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--n-500);
  border: 0;
  transition: background-color var(--dur-fast) var(--ease);
}
@media (hover: hover) {
  .rail input:hover::-webkit-slider-thumb { background: var(--n-400); }
}
.rail input:active::-webkit-slider-thumb { background: var(--n-300); }

.rail input::-moz-range-track { height: 8px; border-radius: var(--r-pill); background: var(--bg-overlay); }
.rail input::-moz-range-progress { background: transparent; }
.rail input::-moz-range-thumb { width: 96px; height: 8px; border: 0; border-radius: var(--r-pill); background: var(--n-500); }

@media (max-width: 640px) {
  /* 手机上三格布局会把「隐藏筛选」挤成两行，改为上下堆叠、整体居中 */
  .option-row { grid-template-columns: 1fr; justify-items: center; gap: var(--sp-2); }
  .option-center, .option-end { grid-column: 1; justify-self: center; }
}

@media (max-width: 900px) {
  /* 窄屏放弃横向矩阵：列纵向堆叠，每列自己带标题。
     17 列在手机上无论如何都读不了，这是唯一诚实的做法。 */
  .sticky-viewport, .rail { display: none; }
  /* 桌面端 .scroller 是 flex 容器、.matrix 是 flex:0 0 auto —— 那是为
     「未溢出时居中」准备的，它让矩阵按 max-content 撑开且拒绝收缩。
     窄屏改成纵向堆叠后这个组合会让矩阵溢出视口再被齐根切掉，所以这里
     把 .scroller 退回普通块级容器。 */
  .scroller { display: block; overflow-x: visible; padding-inline: var(--sp-3); }
  .matrix { grid-template-columns: 1fr !important; width: 100%; min-width: 0; gap: var(--sp-5); }
  .column { width: auto !important; min-width: 0; }
  /* 不做粘性：列纵向堆叠后每列自带标题，滚动时它自然就在视野附近，
     粘住反而会在与页首交界处来回抖。 */
  .mobile-heading {
    display: block;
    margin-bottom: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--bg-page) 70%, var(--tier) 30%);
    box-shadow: inset 3px 0 0 var(--tier);
    font-family: var(--font-title);
    font-size: var(--fs-body);
    font-weight: var(--fw-bold);
    color: var(--fg-default);
  }
}

:global(html[lang="en"]) .cell-count { flex-direction: column; align-items: flex-end; gap: 0; }
</style>
