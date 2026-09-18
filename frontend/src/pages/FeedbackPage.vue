<script setup lang="ts">
/**
 * 意见箱。
 *
 * 三条与旧版不同的行为，改的时候别退回去：
 *   1. 意见状态由左侧色脊表达（进行中 / 待决定 / 已接受 / 已拒绝），
 *      不用 ✓ / × 字符 —— 那两个字形在不同系统上宽度不一
 *   2. 投票人的评论直接列出，不藏在 hover 气泡里（触摸屏上摸不到）
 *   3. 已完成与未完成的人分开计票，分歧一眼看得出来
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NButtonGroup, NInput, NModal, NRadioButton, NRadioGroup, NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { suggestionKindLabel, suggestionStateLabel } from "@shared/labels";
import { suggestionDueAt, suggestionRemaining, suggestionVotingOpen } from "@shared/suggestions";
import { challengeSelectionOptions, emptyChallengeSelection, type ChallengeSelection } from "@shared/challenge-selection";
import type { Suggestion, SuggestionResponse, SuggestionTier } from "@shared/types";
import { api } from "@/lib/api";
import { catalog, catalogReady, refreshCatalog } from "@/lib/catalog";
import { getChallenge, getMap } from "@/lib/selectors";
import { submissionsForChallenge } from "@/lib/projection";
import { resolveChineseName } from "@/lib/names";
import { useLanguage, type MessageKey } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import LoadState from "@/components/LoadState.vue";
import ChallengePicker from "@/components/ChallengePicker.vue";
import ChallengeStats from "@/components/ChallengeStats.vue";
import RecordTable from "@/components/RecordTable.vue";
import TierBadge from "@/components/TierBadge.vue";
import TierMove from "@/components/TierMove.vue";
import TierSelect from "@/components/TierSelect.vue";
import VoteBar, { type Tally } from "@/components/VoteBar.vue";
import VoteCohort from "@/components/VoteCohort.vue";
import FormField from "@/components/FormField.vue";

type PickerMode = null | "picker" | "placement" | "general" | "split";
type Vote = "NONE" | "FOR" | "AGAINST" | "INDIFFERENT";

const kinds = ["ALL", "GENERAL", "CHALLENGE", "OWN COMPLETED CHALLENGES"] as const;
const states = ["ONGOING", "UNDECIDED", "DECIDED"] as const;

const { t, apiError } = useLanguage();
const { account } = storeToRefs(useSessionStore());
const { nameMode, onlyOfficialChinese } = storeToRefs(useDisplayStore());

const busy = ref(false);
const notice = ref("");
const responseReady = ref(false);
const kind = ref<(typeof kinds)[number]>("ALL");
const state = ref<(typeof states)[number]>("ONGOING");
const query = ref("");
const modal = ref<PickerMode>(null);
const detailId = ref<number | null>(null);
const myVote = ref<Vote>("NONE");
const commentDraft = ref("");
const selection = ref<ChallengeSelection>(emptyChallengeSelection);
const pickTier = ref<string | null>(null);
const proposalTitle = ref("");
const proposalBody = ref("");

/* ── 日期与倒计时 ───────────────────────────────────────── */
function parseSuggestionDate(value?: string) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const then = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(then.getTime()) ? undefined : then;
}

function relativeDate(value?: string) {
  const then = parseSuggestionDate(value);
  if (!then) return "";
  const days = Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
  if (days < 1) return t("feedback.today");
  if (days < 30) return t("feedback.daysAgo", { count: days });
  if (days < 365) return t("feedback.monthsAgo", { count: Math.floor(days / 30) });
  return t("feedback.yearsAgo", { count: Math.floor(days / 365) });
}

/** 截止规则在 @shared/suggestions，和服务端推导 state 用的是同一份。 */
function remainingTime(createdAt?: string, dueAt?: string) {
  const left = suggestionRemaining(suggestionDueAt(createdAt, dueAt));
  if (!left) return "";
  if (left.ended) return t("feedback.ended");
  return left.days > 0
    ? t("feedback.remainingDays", { days: left.days, hours: left.hours })
    : t("feedback.remainingHours", { hours: Math.max(1, left.hours) });
}

/* ── 目标与标题 ─────────────────────────────────────────── */
function suggestionTarget(item: Suggestion) {
  if (item.challengeId) {
    const challenge = getChallenge(item.challengeId);
    if (challenge) {
      const map = getMap(challenge.mapId);
      return map ? { href: `/map/${map.id}`, map } : undefined;
    }
    const multi = catalog.value.multiMapChallenges.find((entry) => entry.id === item.challengeId);
    if (multi) return { href: `/multi-challenge/${multi.id}`, map: undefined };
  }
  const map = item.mapId ? getMap(item.mapId) : undefined;
  if (map) return { href: `/map/${map.id}`, map };
  const campaign = item.campaignId ? catalog.value.campaigns.find((entry) => entry.id === item.campaignId) : undefined;
  return campaign ? { href: `/campaign/${campaign.id}`, map: undefined } : undefined;
}

/** 标题形如 `Map Name（中文名）`，拆成英文与中文两截。 */
function splitTitle(title: string) {
  const start = title.indexOf("（");
  if (start < 0) return { en: title, cn: "" };
  let depth = 0;
  let end = -1;
  for (let index = start; index < title.length; index += 1) {
    if (title[index] === "（") depth += 1;
    else if (title[index] === "）") { depth -= 1; if (depth === 0) { end = index; break; } }
  }
  if (end < 0) return { en: title, cn: "" };
  return {
    cn: title.slice(start + 1, end).trim(),
    en: `${title.slice(0, start)} ${title.slice(end + 1)}`.replace(/\s+/g, " ").trim(),
  };
}

/** 状态即颜色：色脊直接说明这条意见走到了哪一步。 */
function stateRail(item: Suggestion) {
  if (item.state !== "DECIDED") return item.state === "ONGOING" ? "var(--accent-600)" : "var(--border-strong)";
  return item.decision === "ACCEPTED" ? "var(--ok-600)" : "var(--danger-600)";
}
function stateText(item: Suggestion) {
  if (item.state !== "DECIDED") return t(suggestionStateLabel[item.state]);
  return t(item.decision === "ACCEPTED" ? "feedback.accepted" : "feedback.rejected");
}

function splitVotes(responses: SuggestionResponse[], completed: boolean) {
  return responses.filter((response) => (completed ? response.progress.includes("已完成") : !response.progress.includes("已完成")));
}

function tally(item: Suggestion, completed: boolean): Tally {
  if (item.state === "DECIDED" && !item.responses.length) {
    const archive = completed
      ? item.archiveVotes?.completed ?? { yes: item.votesFor, no: item.votesAgainst, neutral: 0 }
      : item.archiveVotes?.notCompleted ?? { yes: 0, no: 0, neutral: 0 };
    return { yes: archive.yes, no: archive.no, neutral: archive.neutral ?? 0 };
  }
  const items = splitVotes(item.responses, completed);
  return {
    yes: items.filter((response) => response.vote === "FOR").length,
    no: items.filter((response) => response.vote === "AGAINST").length,
    neutral: items.filter((response) => response.vote === "INDIFFERENT").length,
  };
}

/* ── 列表 ───────────────────────────────────────────────── */
const filtered = computed(() => catalog.value.suggestions
  .filter((item) => {
    const kindOk = kind.value === "ALL" || (kind.value === "OWN COMPLETED CHALLENGES"
      ? Boolean(account.value?.claimedPlayerId && item.challengeId
        && submissionsForChallenge(item.challengeId).some((record) => record.playerId === account.value!.claimedPlayerId))
      : item.kind === kind.value);
    if (!kindOk || item.state !== state.value) return false;
    const map = suggestionTarget(item)?.map;
    const haystack = `${item.title} ${item.source} ${item.body} ${map?.name ?? ""} ${map?.cnName ?? ""}`.toLowerCase();
    return haystack.includes(query.value.toLowerCase());
  })
  .sort((a, b) => (parseSuggestionDate(b.createdAt)?.getTime() ?? 0) - (parseSuggestionDate(a.createdAt)?.getTime() ?? 0)));

type RowView = {
  item: Suggestion; href?: string; rail: string; state: string;
  title: string; subtitle: string; timeLeft: string;
};

const rows = computed<RowView[]>(() => filtered.value.map((item) => {
  const target = suggestionTarget(item);
  const map = target?.map;
  const parts = splitTitle(item.title);
  const fallbackCn = map ? resolveChineseName(map.name, map.cnName, map.searchAliases, onlyOfficialChinese.value) : undefined;
  const translated = parts.cn || (fallbackCn
    ? `${fallbackCn}${parts.en.startsWith(map?.name || "") ? parts.en.slice((map?.name || "").length) : ""}`
    : "");
  const cnOnly = nameMode.value === "cn" && translated;
  return {
    item,
    href: target?.href,
    rail: stateRail(item),
    state: stateText(item),
    title: cnOnly ? translated : parts.en,
    subtitle: nameMode.value === "both" && translated ? translated : "",
    timeLeft: item.kind !== "GENERAL" && item.state !== "DECIDED"
      ? item.timeLeft || remainingTime(item.createdAt, item.dueAt)
      : "",
  };
}));

/* ── 详情 ───────────────────────────────────────────────── */
const detail = computed(() => (detailId.value ? catalog.value.suggestions.find((item) => item.id === detailId.value) : undefined));
const detailTitle = computed(() => {
  if (!detail.value) return "";
  const parts = splitTitle(detail.value.title);
  return nameMode.value === "cn" && parts.cn ? parts.cn : parts.en;
});
const detailSubtitle = computed(() => {
  if (!detail.value || nameMode.value !== "both") return "";
  return splitTitle(detail.value.title).cn;
});
const detailChallenge = computed(() => (detail.value?.challengeId ? getChallenge(detail.value.challengeId) : undefined));
const detailMulti = computed(() => (detail.value?.challengeId
  ? catalog.value.multiMapChallenges.find((item) => item.id === detail.value!.challengeId)
  : undefined));
const detailRecords = computed(() => {
  const target = detailChallenge.value ?? detailMulti.value;
  return target ? submissionsForChallenge(target.id) : [];
});

/** 只有登录、已取回本人回应、且投票窗口还开着时才能表态。 */
const canRespond = computed(() => Boolean(account.value && responseReady.value && !busy.value && detail.value && suggestionVotingOpen(detail.value)));

watch([detailId, account], async () => {
  notice.value = "";
  commentDraft.value = "";
  responseReady.value = false;
  myVote.value = "NONE";
  const id = detailId.value;
  if (!id || !account.value) return;
  const { ok, data } = await api.get<{ data?: { vote?: Vote; comment?: string } }>(`/api/suggestions/${id}/response`);
  if (detailId.value !== id) return;
  if (!ok) { notice.value = apiError(data); return; }
  myVote.value = data.data?.vote ?? "NONE";
  commentDraft.value = data.data?.comment ?? "";
  responseReady.value = true;
});

async function send(path: string, body: Record<string, unknown>) {
  busy.value = true;
  notice.value = "";
  const { ok, data } = await api.post<{ data?: { vote?: Vote } }>(path, body);
  busy.value = false;
  if (!ok) { notice.value = apiError(data); return false; }
  if (data.data?.vote) myVote.value = data.data.vote;
  notice.value = t("feedback.saved");
  if (!await refreshCatalog()) notice.value = t("feedback.savedRefreshFailed");
  return true;
}

const picked = computed(() => challengeSelectionOptions(catalog.value, selection.value, modal.value === "split").value);
const pickedChallenge = computed(() =>
  [...catalog.value.challenges, ...catalog.value.multiMapChallenges].find((item) => item.id === picked.value.challengeId));

const createDisabled = computed(() => !account.value || busy.value || !proposalBody.value.trim()
  || (modal.value === "general" ? !proposalTitle.value.trim()
    : modal.value === "placement" ? !picked.value.challengeId || !pickTier.value
      : !picked.value.mapId));

function resetProposal() {
  selection.value = emptyChallengeSelection;
  pickTier.value = null;
  proposalTitle.value = "";
  proposalBody.value = "";
  notice.value = "";
}

async function create() {
  const done = await send("/api/suggestions", {
    kind: modal.value,
    title: proposalTitle.value,
    body: proposalBody.value,
    mapId: picked.value.mapId,
    challengeId: picked.value.challengeId,
    suggestedTier: pickTier.value,
  });
  if (!done) return;
  modal.value = null;
  state.value = "ONGOING";
  kind.value = "ALL";
  query.value = "";
}

function vote(value: Vote) {
  if (!canRespond.value || !detail.value) return;
  void send(`/api/suggestions/${detail.value.id}/response`, { vote: value });
}

const kindLabel = (value: (typeof kinds)[number]) => t(suggestionKindLabel[value] as MessageKey);
const stateLabel = (value: (typeof states)[number]) => t(suggestionStateLabel[value]);

const choices = computed(() => [
  { mode: "placement" as const, name: t("feedback.kindPlacement"), desc: t("feedback.kindPlacementDesc") },
  { mode: "split" as const, name: t("feedback.kindSplit"), desc: t("feedback.kindSplitDesc") },
  { mode: "general" as const, name: t("feedback.kindGeneral"), desc: t("feedback.kindGeneralDesc") },
]);

const closeDetail = () => { if (!busy.value) { detailId.value = null; commentDraft.value = ""; } };
</script>

<template>
  <div class="page">
    <LoadState v-if="!catalogReady" variant="page" :label="t('feedback.loading')" />
    <template v-else>
      <header class="head">
        <div class="head-text">
          <p class="eyebrow">{{ t("nav.feedback") }}</p>
          <h1 class="title">{{ t("feedback.title") }}</h1>
          <p class="lede">{{ t("feedback.lede") }}</p>
        </div>
        <NButton type="primary" @click="resetProposal(); modal = 'picker'">{{ t("feedback.new") }}</NButton>
      </header>

      <p v-if="notice && !modal && !detail" role="status" class="notice">{{ notice }}</p>

      <!-- 类型和状态分别筛选；长标签使用组件内置横向滚动。 -->
      <div class="filters">
        <NTabs show-scroll-button v-model:value="kind" type="line" size="small" justify-content="space-around" :aria-label="t('feedback.kind')">
          <NTab v-for="value in kinds" :key="value" :name="value">{{ kindLabel(value) }}</NTab>
        </NTabs>
        <div class="filter-row">
          <NButtonGroup size="medium" class="state-buttons" :aria-label="t('feedback.state')">
            <NButton
              v-for="value in states"
              :key="value"
              class="state-button"
              :type="state === value ? 'primary' : 'default'"
              :aria-pressed="state === value"
              @click="state = value"
            >{{ stateLabel(value) }}</NButton>
          </NButtonGroup>
          <NInput v-model:value="query" class="search" clearable :placeholder="t('feedback.searchPlaceholder')" :aria-label="t('feedback.searchPlaceholder')" />
        </div>
      </div>

      <p v-if="!rows.length" class="empty">{{ t("feedback.empty") }}</p>
      <ul v-else class="list">
        <li v-for="row in rows" :key="row.item.id">
          <div class="row" :style="{ '--row-rail': row.rail }">
            <!-- 整行可点由一个铺满的真按钮承担，标题链接靠 z-index 浮在它之上：
                 两者是并列的可聚焦元素，键盘与读屏软件都读得清楚。 -->
            <button type="button" class="row-hit" @click="detailId = row.item.id">{{ t("feedback.openDetail") }}</button>

            <div class="row-top">
              <div class="row-heading">
                <div class="row-marks">
                  <span class="state-chip">{{ row.state }}</span>
                  <span v-if="row.item.kind === 'GENERAL' || row.item.source === 'split'" class="kind-chip">
                    {{ t(row.item.source === "split" ? "feedback.kindSplit" : "feedback.kindGeneral") }}
                  </span>
                </div>
                <RouterLink v-if="row.href" :to="row.href" class="row-title" @click.stop>{{ row.title }}</RouterLink>
                <span v-else class="row-title">{{ row.title }}</span>
                <p v-if="row.subtitle" class="row-subtitle">{{ row.subtitle }}</p>
              </div>
              <span v-if="row.timeLeft" class="time-left">{{ row.timeLeft }}</span>
            </div>

            <p v-if="row.item.source === 'split'" class="row-body">{{ t("feedback.splitDescription") }}</p>
            <TierMove v-else :from="row.item.currentTier" :to="row.item.suggestedTier" size="sm" />
            <p v-if="row.item.body" class="row-body">{{ row.item.body }}</p>

            <div class="row-foot">
              <span class="author">{{ row.item.author }}</span>
              <span v-if="row.item.createdAt">{{ relativeDate(row.item.createdAt) }}</span>
            </div>

            <div class="bars" :style="row.item.kind === 'GENERAL' ? { gridTemplateColumns: '1fr' } : undefined">
              <VoteBar
                v-if="row.item.kind === 'GENERAL'"
                :label="t('feedback.votes')"
                :tally="{ yes: row.item.votesFor, no: row.item.votesAgainst, neutral: row.item.responses.filter((r) => r.vote === 'INDIFFERENT').length }"
              />
              <template v-else>
                <VoteBar :label="t('feedback.completed')" :tally="tally(row.item, true)" />
                <VoteBar :label="t('feedback.notCompleted')" :tally="tally(row.item, false)" />
              </template>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <!-- ── 详情 ─────────────────────────────────────────────── -->
    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detailTitle"
      :bordered="false"
      style="max-width: 860px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) closeDetail(); }"
    >
      <template v-if="detailSubtitle" #header-extra><span class="subtitle">{{ detailSubtitle }}</span></template>
      <div v-if="detail" class="detail">
        <div class="detail-meta">
          <span class="state-chip" :style="{ '--row-rail': stateRail(detail) }">{{ stateText(detail) }}</span>
          <span class="author">{{ detail.author }}</span>
          <span v-if="detail.createdAt">{{ relativeDate(detail.createdAt) }}</span>
          <span v-if="detail.kind !== 'GENERAL' && detail.state !== 'DECIDED'" class="time-left">
            {{ detail.timeLeft || remainingTime(detail.createdAt, detail.dueAt) }}
          </span>
        </div>

        <p v-if="detail.source === 'split'" class="detail-body">{{ t("feedback.splitDescription") }}</p>
        <TierMove v-else :from="detail.currentTier" :to="detail.suggestedTier" />
        <p v-if="detail.body" class="detail-body">{{ detail.body }}</p>

        <div v-if="detail.state === 'DECIDED'" class="decision" :style="{ '--row-rail': stateRail(detail) }">
          <strong>{{ t(detail.decision === "ACCEPTED" ? "feedback.accepted" : "feedback.rejected") }}</strong>
          <span v-if="detail.decisionNote">{{ detail.decisionNote }}</span>
        </div>
        <fieldset v-else class="vote-area" :disabled="!canRespond">
          <p class="vote-hint">{{ t(account ? "feedback.responseHint" : "feedback.login") }}</p>
          <div class="vote-mine">
            <span class="vote-label">{{ t("feedback.myVote") }}</span>
            <NRadioGroup :value="myVote" size="small" :aria-label="t('feedback.myVote')" @update:value="vote">
              <NRadioButton value="NONE">{{ t("feedback.noVote") }}</NRadioButton>
              <NRadioButton value="FOR">{{ t("feedback.for") }}</NRadioButton>
              <NRadioButton value="AGAINST">{{ t("feedback.against") }}</NRadioButton>
              <NRadioButton value="INDIFFERENT">{{ t("feedback.neutral") }}</NRadioButton>
            </NRadioGroup>
          </div>
          <FormField :label="t('feedback.comment')">
            <NInput v-model:value="commentDraft" type="textarea" :rows="3" :maxlength="10000" :placeholder="t('feedback.commentPlaceholder')" />
          </FormField>
          <div class="vote-actions">
            <NButton :disabled="!canRespond" @click="send(`/api/suggestions/${detail.id}/response`, { comment: commentDraft })">
              {{ t("feedback.postComment") }}
            </NButton>
          </div>
        </fieldset>
        <p v-if="notice" role="status" class="notice">{{ notice }}</p>

        <div class="cohorts">
          <VoteCohort
            v-if="detail.kind === 'GENERAL'"
            :title="t('feedback.votes')"
            :responses="detail.responses"
            :archive="!detail.responses.length ? { yes: detail.votesFor, no: detail.votesAgainst, neutral: 0 } : undefined"
          />
          <template v-else-if="detail.state === 'DECIDED' && !detail.responses.length">
            <VoteCohort :title="t('feedback.completed')" :responses="[]" :archive="tally(detail, true)" />
            <VoteCohort :title="t('feedback.notCompleted')" :responses="[]" :archive="tally(detail, false)" />
          </template>
          <template v-else>
            <VoteCohort :title="t('feedback.completed')" :responses="splitVotes(detail.responses, true)" />
            <VoteCohort :title="t('feedback.notCompleted')" :responses="splitVotes(detail.responses, false)" />
          </template>
        </div>

        <section v-if="detail.responses.some((r) => !r.vote && r.comment)" class="mine">
          <h3 class="cohort-title">{{ t("feedback.comment") }}</h3>
          <p v-for="(response, index) in detail.responses.filter((r) => !r.vote && r.comment)" :key="index" class="mine-item">
            <b>{{ response.player }}</b> · {{ response.comment }}
          </p>
        </section>

        <section v-if="detailChallenge || detailMulti" class="challenge-data">
          <h3 class="cohort-title">{{ t("feedback.challengeData") }}</h3>
          <ChallengeStats :records="detailRecords" />
          <h3 class="cohort-title">{{ t("common.records") }}</h3>
          <RecordTable :records="detailRecords" />
        </section>
      </div>
    </NModal>

    <!-- ── 新建：先选类型 ────────────────────────────────────── -->
    <NModal
      :show="modal === 'picker'"
      preset="card"
      :title="t('feedback.new')"
      :bordered="false"
      style="max-width: 460px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value && !busy) modal = null; }"
    >
      <div class="choices">
        <button v-for="choice in choices" :key="choice.mode" type="button" class="choice" @click="modal = choice.mode">
          <strong>{{ choice.name }}</strong>
          <span>{{ choice.desc }}</span>
        </button>
      </div>
    </NModal>

    <!-- ── 新建：难度调整 / 拆分 ─────────────────────────────── -->
    <NModal
      :show="modal === 'placement' || modal === 'split'"
      preset="card"
      :title="t(modal === 'split' ? 'feedback.newSplit' : 'feedback.newPlacement')"
      :bordered="false"
      style="max-width: 680px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value && !busy) modal = null; }"
    >
      <div class="proposal">
        <ChallengePicker v-model="selection" :map-only="modal === 'split'" />

        <div v-if="modal === 'placement' && pickedChallenge" class="preview">
          <span class="preview-label">{{ t("feedback.tierChange") }}</span>
          <div class="tier-move">
            <TierBadge :tier="pickedChallenge.tier ?? 'undetermined'" />
            <span class="arrow" aria-hidden="true" />
            <TierBadge v-if="pickTier" :tier="pickTier as SuggestionTier" />
            <span v-else class="tier-blank">{{ t("feedback.chooseTier") }}</span>
          </div>
        </div>

        <FormField v-if="modal === 'placement'" :label="t('feedback.suggestedTier')" required>
          <TierSelect v-model="pickTier" :placeholder="t('feedback.chooseTier')" :aria-label="t('feedback.suggestedTier')" />
        </FormField>

        <FormField :label="t('feedback.note')" :hint="t('feedback.noteHint')" required>
          <NInput v-model:value="proposalBody" type="textarea" :rows="6" :maxlength="10000" />
        </FormField>
      </div>
      <template #footer>
        <div class="modal-foot">
          <span class="foot-note" role="status">{{ notice || (!account ? t("feedback.login") : "") }}</span>
          <NButton quaternary :disabled="busy" @click="modal = 'picker'; selection = emptyChallengeSelection">{{ t("common.back") }}</NButton>
          <NButton type="primary" :disabled="createDisabled" @click="create">{{ t("feedback.create") }}</NButton>
        </div>
      </template>
    </NModal>

    <!-- ── 新建：一般建议 ────────────────────────────────────── -->
    <NModal
      :show="modal === 'general'"
      preset="card"
      :title="t('feedback.newGeneral')"
      :bordered="false"
      style="max-width: 560px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value && !busy) modal = null; }"
    >
      <div class="proposal">
        <FormField :label="t('feedback.titleField')" required>
          <NInput v-model:value="proposalTitle" :maxlength="200" show-count />
        </FormField>
        <FormField :label="t('feedback.body')" required>
          <NInput v-model:value="proposalBody" type="textarea" :rows="8" :maxlength="10000" />
        </FormField>
      </div>
      <template #footer>
        <div class="modal-foot">
          <span class="foot-note" role="status">{{ notice || (!account ? t("feedback.login") : "") }}</span>
          <NButton quaternary :disabled="busy" @click="modal = 'picker'; selection = emptyChallengeSelection">{{ t("common.back") }}</NButton>
          <NButton type="primary" :disabled="createDisabled" @click="create">{{ t("feedback.create") }}</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
/* 分区手段与全站一致：地面色差 + 细线 + 留白，不用圆角卡片。 */
.page {
  max-width: 680px;
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-7) 96px;
  display: grid;
  gap: var(--sp-6);
  align-content: start;
}

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-5); flex-wrap: wrap; }
.head-text { display: grid; gap: var(--sp-3); min-width: 0; }
.eyebrow {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}
.title {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.02em;
  color: var(--fg-default);
  text-wrap: balance;
}
.lede { margin: 0; max-width: 56ch; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }

.filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); min-width: 0; }
.state-buttons { flex: 0 0 auto; }
.search { flex: 1 1 0; min-width: 0; max-width: 280px; }
.notice { margin: 0; font-size: var(--fs-sm); color: var(--fg-muted); }
.empty { margin: 0; padding: var(--sp-7) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }

/* ── 意见列表：行与行之间只有一条细线，左侧色脊说明它走到了哪一步。 ── */
.list { margin: 0; padding: 0; list-style: none; border-top: var(--hairline); }
.list > li { border-bottom: var(--hairline); }

.row {
  position: relative;
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-5) var(--sp-4) var(--sp-5) var(--sp-5);
  border-left: var(--rail-w) solid var(--row-rail, var(--border-strong));
  transition: background-color var(--dur-fast) var(--ease);
}
@media (hover: hover) {
  .row:hover { background: var(--bg-raised); }
}

.row-hit {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: transparent;
  font-size: 0;
  cursor: pointer;
}
.row-hit:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -3px; }

.row-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
.row-heading { display: grid; gap: var(--sp-2); min-width: 0; }
.row-marks { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 状态用「色点 + 文字」。 */
.state-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .04em;
  color: var(--fg-muted);
}
.state-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--row-rail, var(--border-strong)); }
.kind-chip {
  padding: 2px var(--sp-2);
  border: var(--hairline);
  border-radius: var(--r-pill);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
}

.row-title {
  position: relative;
  z-index: 1;
  justify-self: start;
  font-family: var(--font-title);
  font-size: var(--fs-h3);
  font-weight: var(--fw-medium);
  line-height: var(--lh-tight);
  color: var(--fg-default);
  text-wrap: balance;
}
a.row-title { color: var(--link); }
@media (hover: hover) {
  a.row-title:hover { color: var(--link-hover); text-decoration: underline; }
}
.row-subtitle { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }

.time-left {
  flex: 0 0 auto;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
  white-space: nowrap;
}

/* 正文只露两行；要读全文就打开详情。 */
.row-body {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-snug);
  color: var(--fg-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.row-foot { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-micro); color: var(--fg-subtle); }
.author { color: var(--fg-muted); font-weight: var(--fw-medium); }

.bars { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); margin-top: var(--sp-1); }

/* ── 详情 ─────────────────────────────────────────────────── */
.detail { display: grid; gap: var(--sp-5); }
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.detail-meta { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-micro); color: var(--fg-subtle); }
.detail-body { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); white-space: pre-wrap; }

.decision {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--row-rail, var(--border-strong));
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.decision strong { font-size: var(--fs-lead); color: var(--fg-default); }
.decision span { font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--fg-secondary); }

.vote-area {
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-5);
  border: 0;
  margin: 0;
  min-width: 0;
  background: var(--bg-inset);
  border-radius: var(--r-md);
}
.vote-hint { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
.vote-mine { display: grid; gap: var(--sp-2); justify-items: start; }
.vote-label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
.vote-actions { display: flex; justify-content: flex-end; }

.cohorts { display: grid; gap: var(--sp-6); }
.cohort-title {
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}

.mine { display: grid; gap: var(--sp-3); }
.mine-item {
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  font-size: var(--fs-body);
  line-height: var(--lh-snug);
  color: var(--fg-secondary);
}
.challenge-data { display: grid; gap: var(--sp-4); }

/* ── 新建 ─────────────────────────────────────────────────── */
.choices { display: grid; gap: 0; border-top: var(--hairline); }
.choice {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-4) var(--sp-3);
  border: 0;
  border-bottom: var(--hairline);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: background-color var(--dur-fast) var(--ease);
}
.choice strong { font-size: var(--fs-lead); font-weight: var(--fw-medium); color: var(--fg-default); }
.choice span { font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--fg-subtle); }
@media (hover: hover) {
  .choice:hover { background: var(--bg-raised); }
}
.choice:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }

.proposal { display: grid; gap: var(--sp-4); }
.preview { display: grid; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); background: var(--bg-inset); border-radius: var(--r-sm); }
.preview-label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
.tier-move { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
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
.tier-blank { font-size: var(--fs-sm); color: var(--fg-disabled); }

.modal-foot { display: flex; align-items: center; gap: var(--sp-2); }
.foot-note { flex: 1 1 auto; font-size: var(--fs-micro); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .page { padding: var(--sp-5) var(--sp-4) 72px; gap: var(--sp-5); }
  .head { align-items: stretch; }
  .filter-row { gap: var(--sp-2); }
  .state-button { padding-inline: var(--sp-2); font-size: var(--fs-sm); }
  .search { max-width: none; }
  .row { padding: var(--sp-4) var(--sp-3) var(--sp-4) var(--sp-4); }
  .bars { grid-template-columns: 1fr; gap: var(--sp-3); }
  .vote-area { padding: var(--sp-4); }
}
</style>
