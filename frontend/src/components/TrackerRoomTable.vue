<script setup lang="ts">
/**
 * 已上传房间的全量数据表，可按列排序。
 *
 * 不做「最难房间」前五名：那是替玩家做取舍。有人找练习成功率最低的房间，有人
 * 找持金死亡最多的，有人只想知道倒数第三个房间的进入率。默认按路线顺序排 ——
 * 那是跑图时脑子里的顺序；点列头改排序，再点一次反向，点「房间」列回到路线顺序。
 *
 * 无数据一律留白（—），排序时永远沉底：没练过的房间不该顶上「成功率最低」。
 */
import { computed, ref } from "vue";
import type { RoomRow } from "@shared/tracker/cct-overlay";
import { useLanguage, type MessageKey } from "@/i18n";

const props = defineProps<{
  rooms: RoomRow[];
  /** 玩家自己的 CCT 尝试窗口，直接写进成功率那一列的列头。 */
  window: number;
}>();

const { t } = useLanguage();

type SortKey = "route" | "windowRate" | "bestStreak" | "entries" | "successes" | "entryChance" | "goldenRate" | "goldenDeaths";

const columns: Array<{ key: SortKey; label: MessageKey; numeric: boolean; windowed?: boolean; value: (row: RoomRow) => number | null }> = [
  { key: "route", label: "tracker.colRoom", numeric: false, value: (row) => row.position },
  { key: "windowRate", label: "tracker.colWindowRate", numeric: true, windowed: true, value: (row) => row.windowRate },
  { key: "bestStreak", label: "tracker.colBestStreak", numeric: true, value: (row) => row.bestStreak },
  { key: "entries", label: "tracker.colEntries", numeric: true, value: (row) => row.entries },
  { key: "successes", label: "tracker.colPasses", numeric: true, value: (row) => row.successes },
  { key: "entryChance", label: "tracker.entryChance", numeric: true, value: (row) => row.entryChance },
  { key: "goldenRate", label: "tracker.goldenRate", numeric: true, value: (row) => row.goldenRate },
  { key: "goldenDeaths", label: "tracker.goldenDeaths", numeric: true, value: (row) => row.goldenDeaths },
];

const sort = ref<{ key: SortKey; descending: boolean }>({ key: "route", descending: false });

const ordered = computed(() => {
  if (sort.value.key === "route") return props.rooms;
  const read = columns.find((column) => column.key === sort.value.key)?.value;
  if (!read) return props.rooms;
  // 无数据的房间不参与比较，始终沉底，两个方向都一样。
  return [...props.rooms].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return sort.value.descending ? right - left : left - right;
  });
});

/** 数值列先看最大的那一头，房间名列则回到路线顺序。 */
function toggle(key: SortKey) {
  sort.value = sort.value.key === key
    ? { key, descending: !sort.value.descending }
    : { key, descending: key !== "route" };
}

const percent = (rate: number | null) => (rate === null ? null : `${(rate * 100).toFixed(1)}%`);
const ariaSort = (key: SortKey) => (sort.value.key !== key ? "none" : sort.value.descending ? "descending" : "ascending");

/** 一次尝试都没记录过才叫没有数据；连过 0 次是真的 0。 */
const bestStreakOf = (room: RoomRow) => (room.windowSamples === 0 && room.bestStreak === 0 ? null : String(room.bestStreak));
</script>

<template>
  <p v-if="!rooms.length" class="none">{{ t("tracker.roomsEmpty") }}</p>
  <div v-else class="scroll">
    <table class="table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :class="{ 'num-head': column.numeric }"
            :aria-sort="ariaSort(column.key)"
          >
            <!-- 列头即排序按钮：整格可点，不在文字旁边再挂一个小图标。 -->
            <button type="button" class="sort" :class="{ active: sort.key === column.key }" @click="toggle(column.key)">
              {{ t(column.label, column.windowed ? { count: window } : undefined) }}
              <!-- 没排序时整个不渲染：留一个空槽会连 gap 一起占宽，居中的列头就偏左了。 -->
              <span v-if="sort.key === column.key" class="arrow" aria-hidden="true">{{ sort.descending ? "↓" : "↑" }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="room in ordered" :key="room.roomKey">
          <th scope="row" class="room">
            <span class="position">{{ room.position ?? "—" }}</span>
            <!-- 过场、结算这类非游玩房间照常列出，但不与练习房间争视线。 -->
            <span :class="{ 'off-route': room.isNonGameplayRoom }">{{ room.displayName }}</span>
          </th>
          <td class="num">
            <template v-if="percent(room.windowRate) !== null">
              {{ percent(room.windowRate) }}<span class="detail">{{ room.windowSuccesses }}/{{ room.windowSamples }}</span>
            </template>
            <span v-else class="empty">—</span>
          </td>
          <td class="num"><template v-if="bestStreakOf(room) !== null">{{ bestStreakOf(room) }}</template><span v-else class="empty">—</span></td>
          <td class="num"><template v-if="room.entries !== null">{{ room.entries }}</template><span v-else class="empty">—</span></td>
          <td class="num"><template v-if="room.successes !== null">{{ room.successes }}</template><span v-else class="empty">—</span></td>
          <td class="num"><template v-if="percent(room.entryChance) !== null">{{ percent(room.entryChance) }}</template><span v-else class="empty">—</span></td>
          <td class="num"><template v-if="percent(room.goldenRate) !== null">{{ percent(room.goldenRate) }}</template><span v-else class="empty">—</span></td>
          <td class="num">{{ room.goldenDeaths }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/**
 * 列宽策略沿用记录表：房间名吃剩余空间，数值列走固定槽位，窄屏时表格自己
 * 横向滚动。房间可能有上百个，因此表体自带纵向滚动与吸顶表头 —— 展开一条
 * 愿望单不该把页面拉长到看不见下一条。
 */
.scroll {
  max-height: 60vh;
  overflow: auto;
  overscroll-behavior: contain;
  /* 与页面滚动条同一套取值：走标准属性还是伪元素各引擎判断不同，显式写一次。 */
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
  margin-inline: calc(var(--sp-3) * -1);
  padding-inline: var(--sp-3);
}

.table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: var(--fs-sm); }
.table th { text-align: left; white-space: nowrap; font-weight: var(--fw-medium); color: var(--fg-subtle); }

/* 吸顶表头：滚到第 80 个房间时还要知道这一列是「进入」还是「通过」。 */
.table thead th { position: sticky; top: 0; z-index: 1; padding: 0; background: var(--bg-inset); border-bottom: var(--hairline); }
.table td, .table tbody th { padding: var(--sp-2) var(--sp-3); border-bottom: var(--hairline); }
.table tbody tr:last-child td, .table tbody tr:last-child th { border-bottom: 0; }

.sort {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: inherit;
  cursor: pointer;
}
.num-head .sort { justify-content: center; }
@media (hover: hover) {
  .sort:hover { color: var(--fg-default); }
}
.sort:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }
.active { color: var(--fg-default); }
.arrow { font-family: var(--font-num); color: var(--accent-400); }

.room { display: flex; align-items: baseline; gap: var(--sp-2); color: var(--fg-default); }
.position {
  flex: 0 0 2.5ch;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  color: var(--fg-disabled);
  text-align: right;
}
.off-route { color: var(--fg-subtle); }

.num { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); text-align: center; white-space: nowrap; color: var(--fg-secondary); }
.detail { margin-left: var(--sp-2); font-size: var(--fs-micro); color: var(--fg-disabled); }
.empty { color: var(--fg-disabled); }
.none { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
</style>
