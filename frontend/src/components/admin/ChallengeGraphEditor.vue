<script setup lang="ts">
/**
 * 挑战关系图。从前置挑战拖到后继挑战即可连线；下游的记录会沿着箭头投影到上游。
 *
 * 方向不是随便选的：记录沿 DAG 向上游投影，所以「往上传」在画布上就是字面
 * 意义的往上，读图时不需要再换算一次方向。
 *
 * 静息状态下画布上唯一的颜色是节点左侧的 Tier 色脊 —— 一张图二十个节点，
 * 颜色一旦超过一种就读不出难度梯度。交互色只有两档：强调色＝这条线成立，
 * 危险色＝这条线会被挡下或即将删除。
 */
import { computed, ref, useId } from "vue";
import { NButton, NModal } from "naive-ui";
import { storeToRefs } from "pinia";
import { ancestorsOf, descendantsOf, ensureDag, relationExists, type ChallengeRelation } from "@shared/challenge-graph";
import { challengeDisplayName } from "@shared/labels";
import { isRatedTier, isStandardTier, isTierCode, ratedTierColor, standardMeta, tierLabel, tierMeta } from "@shared/tiers";
import { curveBetween, layoutChallengeGraph, NODE_H, NODE_W, nodeExit } from "@/lib/challenge-graph-layout";
import { relationsForMap } from "@/lib/projection";
import { getMapChallenges } from "@/lib/selectors";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import { useDisplayStore } from "@/stores/display";

const props = defineProps<{ mapId: number }>();
const emit = defineEmits<{ close: [] }>();

const TIP_W = 252;
const edgeKey = (edge: ChallengeRelation) => `${edge.from}>${edge.to}`;

const { tierColors } = storeToRefs(useDisplayStore());
const markerId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const surface = ref<HTMLElement | null>(null);

const nodes = computed(() => getMapChallenges(props.mapId));
const nodeIds = computed(() => nodes.value.map((item) => item.id));
const edges = ref<ChallengeRelation[]>(relationsForMap(props.mapId));

/** 连线拖拽的中间态。坐标是画布内容坐标，不是视口坐标。 */
type Drag = { from: number; x: number; y: number; over: number | null };
const linkFrom = ref<number | null>(null);
const drag = ref<Drag | null>(null);
const hoverId = ref<number | null>(null);
const hoverEdge = ref<string | null>(null);
const saving = ref(false);

const layout = computed(() => layoutChallengeGraph(nodeIds.value, edges.value));
const nameOf = (id: number) => {
  const node = nodes.value.find((item) => item.id === id);
  return node ? challengeDisplayName(node) : String(id);
};

/** 连线是否可落：自环、重复与成环都要挡在落点之前，而不是保存时才报错。 */
function linkState(from: number, to: number) {
  if (from === to) return "self" as const;
  if (edges.value.some((edge) => edge.from === from && edge.to === to)) return "exists" as const;
  if (relationExists(to, from, edges.value)) return "cycle" as const;
  return "ok" as const;
}

function connect(from: number, to: number) {
  const state = linkState(from, to);
  if (state === "cycle") { toast.error(`${nameOf(from)} 已经在 ${nameOf(to)} 的下游，这条边会成环。`); return; }
  if (state !== "ok") return;
  edges.value = ensureDag(nodeIds.value, [...edges.value, { from, to }]);
}

/** 点选：先定起点，再点终点。键盘回车走的也是这条分支。 */
function tap(id: number) {
  if (linkFrom.value === null) { linkFrom.value = id; return; }
  const from = linkFrom.value;
  linkFrom.value = null;
  if (from !== id) connect(from, id);
}

/** 一个手势两种用法：按下就拖出箭头，原地松手则退回点选。 */
function beginLink(id: number, event: PointerEvent) {
  if (event.button !== 0) return;
  const origin = { x: event.clientX, y: event.clientY };
  let moved = false;

  const nodeUnder = (native: PointerEvent) => {
    const element = document.elementFromPoint(native.clientX, native.clientY) as HTMLElement | null;
    const target = element?.closest<HTMLElement>("[data-node]")?.dataset.node;
    return target && Number(target) !== id ? Number(target) : null;
  };
  const move = (native: PointerEvent) => {
    if (!moved && Math.hypot(native.clientX - origin.x, native.clientY - origin.y) < 4) return;
    moved = true;
    const box = surface.value?.getBoundingClientRect();
    if (!box) return;
    hoverId.value = null;
    drag.value = { from: id, x: native.clientX - box.left, y: native.clientY - box.top, over: nodeUnder(native) };
  };
  const finish = (native: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    if (moved) {
      const target = nodeUnder(native);
      if (target !== null) connect(id, target);
      drag.value = null;
      linkFrom.value = null;
      return;
    }
    tap(id);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

/**
 * 图有两种读法，取决于此刻手上有没有起点。
 * 空着手悬停：点亮这个挑战的整条投影链。手上有起点：改成灰掉所有落不下去的
 * 目标，因为这时候要回答的是「能连到哪」，不是「现在连着谁」。
 */
const armed = computed(() => drag.value?.from ?? linkFrom.value);
const hoverChain = computed(() => (hoverId.value !== null && !drag.value
  ? { up: ancestorsOf(hoverId.value, edges.value), down: descendantsOf(hoverId.value, edges.value) }
  : null));
const trace = computed(() => {
  if (armed.value !== null || hoverId.value === null || !hoverChain.value) return null;
  return { ...hoverChain.value, lit: new Set([hoverId.value, ...hoverChain.value.up, ...hoverChain.value.down]) };
});

function onPath(edge: ChallengeRelation) {
  const current = trace.value;
  if (!current || hoverId.value === null) return false;
  const upstream = (id: number) => id === hoverId.value || current.up.has(id);
  const downstream = (id: number) => id === hoverId.value || current.down.has(id);
  return (upstream(edge.from) && upstream(edge.to)) || (downstream(edge.from) && downstream(edge.to));
}

/** 一条边都没连上的挑战单独标出来：整理关系时最容易漏的就是它们。 */
const attached = computed(() => new Set(edges.value.flatMap((edge) => [edge.from, edge.to])));
const loose = computed(() => nodes.value.filter((node) => !attached.value.has(node.id)).length);

async function save() {
  saving.value = true;
  try {
    await sendAdminCommand(`/api/admin/maps/${props.mapId}/relations`, {
      method: "PUT",
      body: { edges: ensureDag(nodeIds.value, edges.value) },
    });
    toast.success("挑战从属关系已保存。");
    emit("close");
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "保存失败。");
  } finally {
    saving.value = false;
  }
}

const tipNode = computed(() => (!drag.value && hoverId.value !== null
  ? nodes.value.find((item) => item.id === hoverId.value)
  : undefined));
const tipPlace = computed(() => (tipNode.value ? layout.value.place.get(tipNode.value.id) : undefined));
const flipTip = computed(() => Boolean(tipPlace.value && layout.value.rows.length > 1 && tipPlace.value.rank === layout.value.rows.length - 1));

const tierText = (tier?: string | null) => {
  if (isTierCode(tier)) return tierMeta[tier].short;
  if (isStandardTier(tier)) return standardMeta[tier].label;
  return tier === "undetermined" ? "待定" : "未定级";
};
const tierFull = (tier?: string | null) => {
  if (isTierCode(tier)) return tierLabel(tier);
  if (isStandardTier(tier)) return standardMeta[tier].label;
  return tier === "undetermined" ? "难度待定" : "尚未定级";
};

const nodeState = (id: number) => {
  if (drag.value?.over === id) return linkState(drag.value.from, id) === "ok" ? "accept" : "reject";
  return armed.value === id ? "source" : undefined;
};
// 指针正压着的节点不参与灰化，否则「为什么落不下去」的红框自己也被灰掉了。
const nodeDim = (id: number) => {
  if (drag.value?.over === id) return false;
  if (armed.value !== null) return id !== armed.value && linkState(armed.value, id) !== "ok";
  return Boolean(trace.value && !trace.value.lit.has(id));
};

const pendingPath = computed(() => {
  const current = drag.value;
  if (!current) return null;
  const from = layout.value.place.get(current.from);
  if (!from) return null;
  const valid = current.over === null ? true : linkState(current.from, current.over) === "ok";
  return { d: curveBetween(nodeExit(from), { x: current.x, y: current.y }), blocked: current.over !== null && !valid };
});

const hint = computed(() => {
  if (linkFrom.value !== null) return `已选中「${nameOf(linkFrom.value)}」作为前置，点击一个没有灰掉的挑战完成连线，Esc 取消。`;
  if (loose.value) return `点击箭头可删除关系，悬停一个挑战会点亮它的整条投影链。虚线框的 ${loose.value} 个挑战还没有连上任何关系。`;
  return "点击箭头可删除这条关系。悬停或聚焦一个挑战，会点亮它的整条投影链。";
});
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    title="挑战关系图"
    :bordered="false"
    style="max-width: 900px; width: calc(100vw - 32px)"
    @update:show="(value: boolean) => { if (!value) emit('close'); }"
  >
    <template #header-extra>
      <span class="subtitle">从前置挑战拖到后继挑战即可连线；成环的连线会被挡下。</span>
    </template>

    <section class="adm-section">
      <h3 class="section-title">
        关系图
        <small>{{ nodes.length }} 个挑战 · {{ edges.length }} 条边</small>
      </h3>

      <p v-if="!nodes.length" class="adm-empty">这张地图还没有挑战。先在目录里添加挑战，再回来连线。</p>
      <div
        v-else
        class="canvas"
        :data-linking="drag || linkFrom !== null ? '' : undefined"
        @keydown.esc.prevent.stop="linkFrom = null"
      >
        <div ref="surface" class="surface" :style="{ width: `${layout.width}px`, height: `${layout.height}px` }">
          <svg class="wires" :width="layout.width" :height="layout.height" aria-hidden="true">
            <defs>
              <marker
                v-for="tone in ['rest', 'lit', 'drop']"
                :key="tone"
                :id="`${markerId}-${tone}`"
                :class="tone"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0.6 L 7.4 4 L 0 7.4 Z" />
              </marker>
            </defs>

            <g
              v-for="edge in edges"
              :key="edgeKey(edge)"
              :data-tone="hoverEdge === edgeKey(edge) ? 'drop' : onPath(edge) ? 'lit' : 'rest'"
              :data-dim="trace && !onPath(edge) ? '' : undefined"
            >
              <template v-if="layout.link.get(edgeKey(edge))">
                <path
                  class="wire"
                  :d="curveBetween(layout.link.get(edgeKey(edge))!.from, layout.link.get(edgeKey(edge))!.to)"
                  :marker-end="`url(#${markerId}-${hoverEdge === edgeKey(edge) ? 'drop' : onPath(edge) ? 'lit' : 'rest'})`"
                />
                <!-- 1.5px 的曲线点不中，命中区单独铺一条透明粗线。 -->
                <path
                  class="grab"
                  :d="curveBetween(layout.link.get(edgeKey(edge))!.from, layout.link.get(edgeKey(edge))!.to)"
                  @click="edges = edges.filter((item) => edgeKey(item) !== edgeKey(edge))"
                  @pointerenter="hoverEdge = edgeKey(edge)"
                  @pointerleave="hoverEdge = hoverEdge === edgeKey(edge) ? null : hoverEdge"
                >
                  <title>{{ `${nameOf(edge.from)} → ${nameOf(edge.to)}，点击删除` }}</title>
                </path>
              </template>
            </g>

            <path
              v-if="pendingPath"
              class="pending"
              :data-blocked="pendingPath.blocked ? '' : undefined"
              :d="pendingPath.d"
              :marker-end="`url(#${markerId}-${pendingPath.blocked ? 'drop' : 'lit'})`"
            />
          </svg>

          <template v-for="node in nodes" :key="node.id">
            <button
              v-if="layout.place.get(node.id)"
              type="button"
              :data-node="node.id"
              class="node"
              :data-state="nodeState(node.id)"
              :data-dim="nodeDim(node.id) ? '' : undefined"
              :data-loose="attached.has(node.id) ? undefined : ''"
              :style="{
                left: `${layout.place.get(node.id)!.x}px`,
                top: `${layout.place.get(node.id)!.y}px`,
                width: `${NODE_W}px`,
                height: `${NODE_H}px`,
                '--node-rail': isRatedTier(node.tier) ? ratedTierColor(node.tier, tierColors) : 'var(--border-strong)',
              }"
              :aria-pressed="armed === node.id"
              @pointerdown="beginLink(node.id, $event)"
              @click="($event as MouseEvent).detail === 0 && tap(node.id)"
              @pointerenter="!drag && (hoverId = node.id)"
              @pointerleave="hoverId = hoverId === node.id ? null : hoverId"
              @focus="hoverId = node.id"
              @blur="hoverId = hoverId === node.id ? null : hoverId"
            >
              <b>{{ challengeDisplayName(node) }}</b>
              <small>{{ tierText(node.tier) }}</small>
            </button>
          </template>

          <aside
            v-if="tipNode && tipPlace"
            class="tip"
            :data-flip="flipTip ? '' : undefined"
            :style="{
              left: `${Math.max(8, Math.min(tipPlace.x + NODE_W / 2 - TIP_W / 2, layout.width - TIP_W - 8))}px`,
              top: `${flipTip ? tipPlace.y - 12 : tipPlace.y + NODE_H + 12}px`,
              width: `${TIP_W}px`,
            }"
          >
            <b>{{ challengeDisplayName(tipNode) }}</b>
            <p class="tip-meta">
              {{ tierFull(tipNode.tier) }}
              <span>{{ tipNode.clearCount }} 人通关</span>
            </p>
            <p class="tip-fact">
              {{ hoverChain?.up.size ? `这里的记录会投影到上游 ${hoverChain.up.size} 个挑战。` : "上游没有挑战，这里的记录只显示在本页。" }}
            </p>
            <p class="tip-fact">
              {{ hoverChain?.down.size ? `下游 ${hoverChain.down.size} 个挑战的记录会投影到这里。` : "下游没有挑战，没有记录会投影过来。" }}
            </p>
          </aside>
        </div>
      </div>

      <p v-if="nodes.length > 1" class="hint">{{ hint }}</p>
    </section>

    <section class="adm-section edges">
      <h3 class="section-title">有向边<small>{{ edges.length }}</small></h3>
      <p v-if="!edges.length" class="adm-empty">还没有从属关系。</p>
      <ul v-else class="adm-list">
        <li
          v-for="edge in edges"
          :key="edgeKey(edge)"
          class="adm-row"
          @pointerenter="hoverEdge = edgeKey(edge)"
          @pointerleave="hoverEdge = hoverEdge === edgeKey(edge) ? null : hoverEdge"
        >
          <span class="edge">
            {{ nameOf(edge.from) }}
            <i class="arrow" aria-label="先于" />
            {{ nameOf(edge.to) }}
          </span>
          <NButton size="small" type="error" @click="edges = edges.filter((item) => item !== edge)">删除</NButton>
        </li>
      </ul>
    </section>

    <template #footer>
      <div class="foot">
        <NButton quaternary @click="emit('close')">取消</NButton>
        <NButton type="primary" :loading="saving" @click="save">保存关系</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.section-title small {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  font-weight: var(--fw-normal);
  color: var(--fg-subtle);
}
.edges { margin-top: var(--sp-5); }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }

.canvas {
  position: relative;
  overflow: auto;
  overscroll-behavior: contain;
  height: clamp(280px, 52vh, 520px);
  background: var(--bg-inset);
  border-radius: var(--r-md);
}
/* 图比画布窄时居中；比画布宽时 auto 边距归零，左侧不会被截掉。 */
.surface { position: relative; margin-inline: auto; }

/* ── 连线 ──────────────────────────────────────────────────── */
.wires { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }
.wire {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1.5;
  transition: stroke var(--dur-fast) var(--ease), stroke-width var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);
}
.wires g[data-tone="lit"] .wire { stroke: var(--accent-400); stroke-width: 2; }
.wires g[data-tone="drop"] .wire { stroke: var(--danger-400); stroke-width: 2; }
.wires g[data-dim] .wire { opacity: .28; }

.grab { fill: none; stroke: transparent; stroke-width: 18; pointer-events: stroke; cursor: pointer; }
.canvas[data-linking] .grab { pointer-events: none; }

.pending { fill: none; stroke: var(--accent-400); stroke-width: 2; stroke-dasharray: 5 5; }
.pending[data-blocked] { stroke: var(--danger-400); }

.rest { fill: var(--border-strong); }
.lit { fill: var(--accent-400); }
.drop { fill: var(--danger-400); }

/* ── 节点 ──────────────────────────────────────────────────── */
.node {
  position: absolute;
  display: grid;
  align-content: center;
  gap: 2px;
  padding: 0 var(--sp-3) 0 var(--sp-4);
  text-align: left;
  background: var(--bg-raised);
  border: 1px solid var(--border-default);
  border-radius: var(--r-md);
  cursor: grab;
  touch-action: none;
  font: inherit;
  transition:
    left var(--dur-base) var(--ease), top var(--dur-base) var(--ease),
    border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease),
    opacity var(--dur-fast) var(--ease);
}
.node::before {
  content: "";
  position: absolute;
  top: -1px;
  bottom: -1px;
  left: -1px;
  width: var(--rail-w);
  border-radius: var(--r-md) 0 0 var(--r-md);
  background: var(--node-rail);
}
.node:active { cursor: grabbing; }
.node:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
@media (hover: hover) {
  .node:hover { border-color: var(--border-strong); }
}

.node b {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: var(--lh-snug);
  color: var(--fg-default);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.node small { font-family: var(--font-num); font-size: var(--fs-micro); color: var(--fg-subtle); }

/* 选中态只改描边与地面，不改填充色相 —— 与全站徽章、行选中同一条规矩。 */
.node[data-state="source"] { border-color: var(--border-focus); background: var(--bg-overlay); }
.node[data-state="accept"] { border-color: var(--accent-400); background: var(--bg-overlay); }
.node[data-state="reject"] { border-color: var(--danger-500); }
.node[data-state="reject"] b { color: var(--fg-muted); }
.node[data-dim] { opacity: .34; }
/* 一条边都没有的挑战：虚线框。整理关系时最容易漏掉的就是这些。 */
.node[data-loose] { border-style: dashed; border-color: var(--border-strong); }

/* ── 悬停卡片 ──────────────────────────────────────────────── */
.tip {
  position: absolute;
  z-index: 3;
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
  background: var(--bg-overlay);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  pointer-events: none;
}
.tip[data-flip] { transform: translateY(-100%); }
.tip b { font-size: var(--fs-body); font-weight: var(--fw-medium); line-height: var(--lh-snug); overflow-wrap: anywhere; }
.tip-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
}
.tip-meta span { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); }
.tip-fact { margin: 0; font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--fg-secondary); }

.hint { margin: var(--sp-3) 0 0; font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--fg-subtle); }

/* ── 边清单 ──────────────────────────────────────────────── */
.edge { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-body); color: var(--fg-secondary); min-width: 0; overflow-wrap: anywhere; }
/* 纯 CSS 箭头，与全站其余箭头同一个形状。 */
.arrow { position: relative; flex: 0 0 auto; width: 16px; height: 8px; }
.arrow::before { content: ""; position: absolute; top: 50%; left: 0; right: 3px; height: 1px; background: var(--fg-subtle); }
.arrow::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 0;
  width: 5px;
  height: 5px;
  border-top: 1px solid var(--fg-subtle);
  border-right: 1px solid var(--fg-subtle);
  transform: translateY(-50%) rotate(45deg);
}
</style>
