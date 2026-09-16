<script setup lang="ts">
/**
 * 通关记录表。地图页、多地图挑战页、意见箱详情共用。
 *
 * 「评价」是一列，不是两列：推荐与否、难度建议、挑战者评论都是同一个人
 * 对同一个挑战的看法。「标签」也是一列，装两类东西：运行事实（FC / DTS /
 * 限定）与验证者备注 —— 形态相同但来源不同，所以备注走中性描边，且**只有
 * 短的**留在格子里；长备注和挑战者评论共用同一个展开行。
 *
 * 表格结构是手写的 <table>：整行可点靠序号格里的真链接，键盘、右键新标签、
 * 读屏软件三者同时正确，这些都不是 NDataTable 能替出来的。分页换成了
 * AppPagination —— 那部分本来就是通用控件，没有理由自己搓。
 */
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppPagination from "@/components/AppPagination.vue";
import { storeToRefs } from "pinia";
import { formatDate } from "@shared/datetime";
import { tierBadgeLabel } from "@shared/tiers";
import type { Submission } from "@shared/types";
import { catalog } from "@/lib/catalog";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";

const props = withDefaults(defineProps<{ records: Submission[]; pageSize?: number }>(), { pageSize: 20 });

const { t, locale } = useLanguage();
const router = useRouter();
const { isAdmin } = storeToRefs(useSessionStore());

const BADGE = /^(FC|月莓|moon|DTS|No Major Skips|Hidden)$/i;
const MOON = /^(?:FC|月莓|moon)$/i;

/**
 * 验证者备注内联显示的字数上限，与 .tag-note 的 max-width 对齐 ——
 * 内联的那些必须完整读得到，超过就收进展开行。库里 65% 的备注在 12 字
 * 以内（「使用速度计」「隐藏银草莓」这类）。改这里要一起改那个 max-width。
 */
const INLINE_NOTE_MAX = 12;

const page = ref(1);
/** 展开中的评论行。 */
const openNotes = ref(new Set<number>());

watch(() => props.records, () => { page.value = 1; openNotes.value = new Set(); });

/** 达成日期升序；没有日期的排到最后，同日按原顺序稳定。 */
const orderedRecords = computed(() => props.records
  .map((record, index) => ({ record, index }))
  .sort((a, b) => {
    const aTime = a.record.achievedAt ? Date.parse(a.record.achievedAt) : Number.NaN;
    const bTime = b.record.achievedAt ? Date.parse(b.record.achievedAt) : Number.NaN;
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.index - b.index;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime || a.index - b.index;
  })
  .map(({ record }) => record));

const rows = computed(() => orderedRecords.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize));

type RowView = {
  record: Submission;
  number: number;
  display: string;
  badgeTags: string[];
  otherTags: string[];
  inlineNote: string;
  longNote: string;
  adminTags: string[];
  hasStatus: boolean;
  hasOpinion: boolean;
  expandable: boolean;
};

const identityOf = (tag: string) => (MOON.test(tag.trim()) ? "fc" : tag.trim().toLocaleLowerCase());

const views = computed<RowView[]>(() => rows.value.map((record, index) => {
  const player = catalog.value.players.find((item) => item.id === record.playerId);
  const display = record.playerDisplayName || player?.name || String(record.playerId);
  const raw = record.tags?.filter((tag) => tag.toUpperCase() !== "RAW" && !tag.startsWith("@admin:")) ?? [];
  const publicTags = raw.filter((tag, tagIndex) => raw.findIndex((candidate) => identityOf(candidate) === identityOf(tag)) === tagIndex);
  const badgeTags = publicTags.filter((tag) => BADGE.test(tag));
  /* BADGE 认不出的公开标签仍然是标签，不是备注 —— 库里就有 All Major Secrets。 */
  const otherTags = publicTags.filter((tag) => !BADGE.test(tag));
  const verifierNote = record.verifierNote?.trim() ?? "";
  const inlineNote = verifierNote.length <= INLINE_NOTE_MAX ? verifierNote : "";
  const longNote = inlineNote ? "" : verifierNote;
  const adminTags = isAdmin.value
    ? [...(record.adminTags ?? []), ...(record.tags?.filter((tag) => tag.startsWith("@admin:")).map((tag) => tag.slice(7)) ?? [])]
    : [];
  return {
    record,
    number: (page.value - 1) * props.pageSize + index + 1,
    display,
    badgeTags,
    otherTags,
    inlineNote,
    longNote,
    adminTags,
    hasStatus: Boolean(badgeTags.length || otherTags.length || verifierNote || adminTags.length),
    hasOpinion: Boolean(record.note) || Boolean(record.opinionTier) || typeof record.recommends === "boolean",
    /* 一行只有一个展开区，长验证者备注与挑战者评论共用它：表格宽度紧张，
       再开一列就要横向滚动。 */
    expandable: Boolean(longNote || record.note),
  };
}));

function toggleNote(id: number) {
  const next = new Set(openNotes.value);
  if (!next.delete(id)) next.add(id);
  openNotes.value = next;
}

/** 评论开头。省略号交给 CSS —— 只有它知道这一格实际有多宽。 */
function noteExcerpt(note: string) {
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 60) : flat;
}

function tagTone(tag: string) {
  if (MOON.test(tag.trim())) return "tag-moon";
  if (/^DTS$/i.test(tag)) return "tag-dts";
  if (/^Hidden$/i.test(tag)) return "tag-hidden";
  return "tag-skips";
}

/** 整行可点只是指针便利；命中嵌套的链接或按钮时不接管。 */
function openRecord(record: Submission, event: MouseEvent) {
  if ((event.target as HTMLElement).closest("a,button,input")) return;
  void router.push(`/record/${record.id}`);
}
</script>

<template>
  <p v-if="!records.length" class="rt-empty">{{ t("records.empty") }}</p>
  <div v-else class="wrap">
    <div class="scroll">
      <table class="table">
        <thead>
          <tr>
            <th scope="col" class="col-index">#</th>
            <th scope="col" class="col-player">{{ t("common.players") }}</th>
            <th scope="col">{{ t("records.tags") }}</th>
            <th scope="col" class="col-date">{{ t("records.date") }}</th>
            <th scope="col" class="col-video">{{ t("common.video") }}</th>
            <th scope="col" class="col-opinion">{{ t("records.opinion") }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="view in views" :key="view.record.id">
            <tr class="row" @click="openRecord(view.record, $event)">
              <td class="col-index">
                <!-- 序号即通往记录详情的真链接：键盘、中键新标签、读屏软件都走它。 -->
                <RouterLink :to="`/record/${view.record.id}`" class="row-link" :aria-label="t('records.view', { player: view.display })">
                  {{ view.number }}
                </RouterLink>
              </td>
              <td class="col-player">
                <span v-if="view.record.playerDisplayName" class="player">{{ view.display }}</span>
                <RouterLink v-else class="player player-link" :to="`/player/${view.record.playerId}`">{{ view.display }}</RouterLink>
              </td>
              <td>
                <div v-if="view.hasStatus" class="tags">
                  <em v-for="tag in view.badgeTags" :key="tag" class="tag" :class="tagTone(tag)">{{ tag }}</em>
                  <em v-for="tag in view.otherTags" :key="`tag-${tag}`" class="tag">{{ tag }}</em>
                  <em v-if="view.inlineNote" class="tag tag-note">{{ view.inlineNote }}</em>
                  <button
                    v-if="view.longNote"
                    type="button"
                    class="note-toggle"
                    :aria-expanded="openNotes.has(view.record.id)"
                    :aria-controls="`note-${view.record.id}`"
                    @click="toggleNote(view.record.id)"
                  >
                    <span class="note-toggle-text">{{ noteExcerpt(view.longNote) }}</span>
                    <span class="note-caret" aria-hidden="true" />
                  </button>
                  <em v-for="tag in view.adminTags" :key="`admin-${tag}`" class="tag tag-admin">{{ tag }}</em>
                </div>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-date num">{{ formatDate(view.record.achievedAt, locale) }}</td>
              <td class="col-video">
                <a v-if="view.record.videoUrl && view.record.videoUrl !== '#'" class="video" :href="view.record.videoUrl" target="_blank" rel="noreferrer">{{ t("common.video") }}</a>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-opinion">
                <div v-if="view.hasOpinion" class="opinion">
                  <em v-if="typeof view.record.recommends === 'boolean'" class="verdict" :class="view.record.recommends ? 'verdict-yes' : 'verdict-no'">
                    {{ view.record.recommends ? t("recommendation.yes") : t("recommendation.no") }}
                  </em>
                  <em v-if="view.record.opinionTier" class="verdict verdict-tier">{{ tierBadgeLabel(view.record.opinionTier).replace(/Tier /, "T") }}</em>
                  <button
                    v-if="view.record.note"
                    type="button"
                    class="note-toggle"
                    :aria-expanded="openNotes.has(view.record.id)"
                    :aria-controls="`note-${view.record.id}`"
                    @click="toggleNote(view.record.id)"
                  >
                    <!-- 按钮标签就是评论本身的开头：不点开也知道里面写了什么。 -->
                    <span class="note-toggle-text">{{ noteExcerpt(view.record.note) }}</span>
                    <span class="note-caret" aria-hidden="true" />
                  </button>
                </div>
                <span v-else class="muted">—</span>
              </td>
            </tr>
            <tr v-if="view.expandable && openNotes.has(view.record.id)" :id="`note-${view.record.id}`" class="note-row">
              <td colspan="6">
                <!-- 两个来源都可能落在这一行，各带各的小标题。 -->
                <template v-if="view.longNote">
                  <span class="note-label">{{ t("records.verifierNote") }}</span>
                  <p class="note-body">{{ view.longNote }}</p>
                </template>
                <template v-if="view.record.note">
                  <span class="note-label" :class="{ 'note-label-next': view.longNote }">{{ t("records.playerComment") }}</span>
                  <p class="note-body">{{ view.record.note }}</p>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <AppPagination
      v-if="records.length > pageSize"
      v-model:page="page"
      :page-size="pageSize"
      :item-count="records.length"
      show-quick-jumper
      size="small"
    />
  </div>
</template>

<style scoped>
/* 列宽策略沿用金榜的硬约束：日期、视频、序号走固定槽位，
   玩家名与标签吃剩余空间。长名字不会把右侧的列挤走。 */
/* 单列显式写成 minmax(0, 1fr)：隐式的 auto 列会按最宽子项的 min-content
   撑开，于是 .table 那条 min-width: 560px 会连着滚动容器和分页一起把
   整页推宽 —— 400px 视口下实测横滚 110px。 */
.wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); min-width: 0; }

/* 窄屏时表格自己横向滚动，页面主体永远不横滚 */
.scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  margin-inline: calc(var(--sp-3) * -1);
  padding-inline: var(--sp-3);
}

.table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: var(--fs-body); }
.table th {
  padding: 0 var(--sp-3) var(--sp-2);
  text-align: left;
  white-space: nowrap;
  border-bottom: var(--hairline);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .06em;
  color: var(--fg-subtle);
}
.table td { padding: var(--sp-3); border-bottom: var(--hairline); vertical-align: middle; color: var(--fg-secondary); }

/* 不要在 <tr> 上建立定位上下文：iOS Safari 不为表格行建立包含块，
   任何依赖它的绝对定位子元素都会一路上溯到视口。 */
.row { cursor: pointer; transition: background-color var(--dur-fast) var(--ease); }
@media (hover: hover) {
  .row:hover { background: var(--bg-raised); }
}

/* 玩家列不给宽度只给下限：昵称多是不含空格的 ID，没有下限会被标签挤扁。 */
.col-index { width: 52px; }
.col-player { min-width: 9em; }
.col-date { width: 108px; white-space: nowrap; }
.col-video { width: 64px; }
/* 内容至多是「推荐」+ 一个档位，两个短词。 */
.col-opinion { width: 7em; }

.row-link {
  display: inline-block;
  min-width: 2ch;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  color: var(--fg-subtle);
}
.row-link:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--r-sm); }
@media (hover: hover) {
  .row:hover .row-link { color: var(--fg-default); }
}

/* break-word 而不是 anywhere：anywhere 会在列变窄时逐字母拆开，
   把 KrisChambers 折成五行。 */
.player { font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: break-word; }
.player-link { color: var(--link); }
@media (hover: hover) {
  .player-link:hover { color: var(--link-hover); text-decoration: underline; }
}

.video { color: var(--link); }
@media (hover: hover) {
  .video:hover { color: var(--link-hover); text-decoration: underline; }
}

.num { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); color: var(--fg-subtle); }
.muted { color: var(--fg-disabled); }

/* ── 标签：一律描边不填充，填充色块会与右侧的 Tier 标签抢注意力。 ── */
.tags { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--sp-2);
  border: 1px solid var(--tag-tone, var(--border-default));
  border-radius: var(--r-sm);
  font-size: var(--fs-micro);
  font-style: normal;
  font-weight: var(--fw-medium);
  line-height: 1.5;
  white-space: nowrap;
  color: var(--tag-tone, var(--fg-muted));
}
/* 运行事实用 --mark-*，不用 --tier-*：Tier 色只表达难度，而且用户自定义
   配色时会连带改掉那组变量。限定与隐藏不占色相 —— 它们已经写在上方的
   挑战标题里，颜色留给真正需要扫读的 FC 与 DTS。 */
.tag-moon { --tag-tone: var(--mark-moon); }
.tag-dts { --tag-tone: var(--mark-dts); }
.tag-skips { --tag-tone: var(--fg-muted); }
.tag-hidden { --tag-tone: var(--fg-disabled); }
.tag-admin { --tag-tone: var(--accent-400); }

/* 24ch 正好放得下 INLINE_NOTE_MAX 那 12 个汉字；改一处要改另一处。
   超过上限的备注根本不会走到这个类上，这里的截断只是兜底。 */
.tag-note {
  --tag-tone: var(--fg-subtle);
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

/* ── 评价 ─────────────────────────────────────────────────
   结论用无边框文字，不用胶囊：胶囊留给运行事实（FC / DTS / 限定），
   无边框彩色文字留给主观判断。形态一分，同一行里两种绿就不会混。 */
.opinion { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.verdict { font-size: var(--fs-micro); font-style: normal; font-weight: var(--fw-medium); white-space: nowrap; }
.verdict-yes { color: var(--ok-400); }
.verdict-no { color: var(--danger-400); }
.verdict-tier { color: var(--accent-400); font-family: var(--font-num); }

/* 评论可能是长段落，用整行展开而不是浮层：表格外层有横向滚动容器，
   任何绝对定位的浮层都会被它裁掉。 */
.note-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  max-width: 22ch;
  padding: 2px var(--sp-2);
  border: 1px solid var(--border-default);
  border-radius: var(--r-sm);
  background: transparent;
  font: inherit;
  font-size: var(--fs-micro);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.note-toggle-text { overflow: hidden; text-overflow: ellipsis; }
/* 展开方向即三角方向 —— 这一格唯一的动效，用来说明「哪一行展开了」。 */
.note-caret {
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border-inline: 3px solid transparent;
  border-top: 4px solid currentColor;
  transition: transform var(--dur-fast) var(--ease);
}
.note-toggle[aria-expanded="true"] .note-caret { transform: rotate(180deg); }
.note-toggle[aria-expanded="true"] { border-color: var(--border-focus); color: var(--link); }
.note-toggle:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
@media (hover: hover) {
  .note-toggle:hover { border-color: var(--border-strong); color: var(--fg-default); }
}

.note-row > td { padding: var(--sp-3) var(--sp-3) var(--sp-4); background: var(--bg-inset); }
.note-label { display: block; margin-bottom: var(--sp-2); font-size: var(--fs-micro); letter-spacing: .06em; color: var(--fg-subtle); }
.note-body {
  margin: 0;
  max-width: 68ch;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--fg-secondary);
  white-space: pre-wrap;
}
/* 展开行里第二个小标题：和上一段正文之间要有气口，否则两组糊成一段。 */
.note-label-next { margin-top: var(--sp-4); }

.rt-empty { margin: 0; padding: var(--sp-7) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }
</style>
