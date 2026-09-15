<script setup lang="ts">
/**
 * 记录详情：一屏读完一条记录的全部字段。
 *
 * 备注是成段的话，标签是若干个词，两者形态不同就别塞进同一格 ——
 * 一段话套上标签的圆角描边会把这一栏撑变形，读者也分不出哪句是验证者写的。
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { formatBeijingDateTime } from "@shared/datetime";
import { challengeDisplayName } from "@shared/labels";
import { isRatedTier, tierBadgeLabel } from "@shared/tiers";
import { tagIdentity } from "@shared/review-tags";
import { catalog, catalogReady, refreshCatalog } from "@/lib/catalog";
import { adminRecords } from "@/lib/admin-overlay";
import { challengeHref } from "@/lib/routes";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LoadState from "@/components/LoadState.vue";
import LinkButton from "@/components/LinkButton.vue";
import TierBadge from "@/components/TierBadge.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import RecordOpinionEditor from "@/components/RecordOpinionEditor.vue";
import WithdrawSubmission from "@/components/WithdrawSubmission.vue";
import AdminRecordDetailEditor from "@/components/admin/AdminRecordDetailEditor.vue";
import type { AdminRecord } from "@/lib/projection";

const props = defineProps<{ id: string }>();

const { t } = useLanguage();
const { isAdmin, adminMode } = storeToRefs(useSessionStore());

const recordId = computed(() => Number(props.id));
const adminView = computed(() => isAdmin.value && adminMode.value);

/*
 * 审核队列里只有站内提交与未通过的记录，历史导入的已通过记录不在其中 ——
 * 而它们同样有「管理编辑」。缺了这一步补查，编辑器会拿到空标签数组，
 * 保存时就把这条记录已有的 badge / note 标签全删了。
 */
const inQueue = computed(() => adminRecords.value.some((item) => item.id === recordId.value));
const fetched = ref<AdminRecord | null>(null);
watch([recordId, adminView, inQueue], async ([id, admin, queued]) => {
  if (!admin || queued) { fetched.value = null; return; }
  const { ok, data } = await api.get<{ record?: AdminRecord }>(`/api/admin/submissions/${id}`);
  if (ok && data.record && recordId.value === id) fetched.value = data.record;
}, { immediate: true });

const view = computed(() => {
  const staticRecord = catalog.value.submissions.find((item) => item.id === recordId.value);
  const adminRecord = adminRecords.value.find((item) => item.id === recordId.value);
  if (!staticRecord && !adminRecord) return null;
  const record = staticRecord || adminRecord!;

  const challenge = catalog.value.challenges.find((item) => item.id === record.challengeId);
  const multiChallenge = catalog.value.multiMapChallenges.find((item) => item.id === record.challengeId);
  const map = challenge ? catalog.value.maps.find((item) => item.id === challenge.mapId) : undefined;
  const campaign = map
    ? catalog.value.campaigns.find((item) => item.id === map.campaignId)
    : catalog.value.campaigns.find((item) => item.id === multiChallenge?.campaignId);
  const player = catalog.value.players.find((item) => item.id === record.playerId);

  const tags = staticRecord?.tags?.filter(Boolean) || [];
  /* 只有标签取补查的结果：其余字段两边同源，混着取只会让「哪一边赢」变得难说。 */
  const editableTags = adminRecord?.reviewTags ?? fetched.value?.reviewTags ?? [];
  const editableIdentities = new Set(editableTags.map((tag) => tagIdentity(tag.text)));
  const normalTags = tags
    .filter((tag) => !/^https?:\/\//i.test(tag))
    .filter((tag, index, source) => {
      const identity = tagIdentity(tag);
      return !editableIdentities.has(identity)
        && source.findIndex((candidate) => tagIdentity(candidate) === identity) === index;
    });

  return {
    id: record.id,
    playerId: record.playerId,
    challenge, multiChallenge, map, campaign, player,
    displayName: staticRecord?.playerDisplayName || player?.name || t("record.unknownPlayer"),
    achievedAt: adminRecord?.achievedAt || record.achievedAt,
    status: staticRecord?.status || adminRecord?.status || "accepted",
    videoUrl: record.videoUrl,
    // 展示用的原片链接会从导入标签里猜一个兜底。
    rawVideoUrl: record.rawVideoUrl || tags.find((tag) => /^https?:\/\//i.test(tag) && tag !== record.videoUrl),
    note: adminRecord?.playerNote ?? staticRecord?.note,
    verifierNote: adminRecord?.verifierNote ?? staticRecord?.verifierNote,
    reviewer: staticRecord?.reviewer || adminRecord?.reviewer,
    reviewedAt: adminRecord?.reviewedAt || staticRecord?.reviewedAt,
    duration: adminRecord?.duration || staticRecord?.duration,
    recommends: adminRecord?.recommends ?? staticRecord?.recommends,
    opinionTier: adminRecord?.opinionTier ?? staticRecord?.opinionTier,
    tier: challenge?.tier || multiChallenge?.tier,
    normalTags,
    badgeTags: editableTags
      .filter((tag) => tag.kind === "badge")
      .filter((tag, index, source) => source.findIndex((candidate) => tagIdentity(candidate.text) === tagIdentity(tag.text)) === index),
    noteTags: editableTags.filter((tag) => tag.kind === "note"),
    proposedTarget: (adminRecord as { proposedTarget?: { campaignName?: string; mapName?: string; challengeName?: string } } | undefined)?.proposedTarget,
  };
});

const missing = computed(() => catalogReady.value
  && (!view.value || (!view.value.challenge && !view.value.multiChallenge && !view.value.proposedTarget)));

const statusLabel = computed(() => {
  const status = view.value?.status;
  if (status === "pending") return t("record.statusPending");
  if (status === "rejected") return t("record.statusRejected");
  if (status === "hidden") return t("record.statusHidden");
  return t("record.statusAccepted");
});

const opinionText = computed(() => {
  const value = view.value?.recommends;
  return value === true ? t("recommendation.yes") : value === false ? t("recommendation.no") : t("common.unfilled");
});

/* 跟着「修改评价」里那个选单的写法走：那里显示 Tier 5，这里就不能显示原始档位码 t5。 */
const opinionTierText = computed(() => (isRatedTier(view.value?.opinionTier) ? tierBadgeLabel(view.value!.opinionTier!) : t("record.noTier")));

const notRecorded = computed(() => t("common.notRecorded"));

/** 管理编辑要的是库里的真实值，不是展示用的兜底值 —— 原片链接尤其如此：
    展示时会从导入标签里猜一个，存回去就把猜出来的写进了 raw_video_url。 */
const editable = computed(() => {
  const current = view.value;
  const challengeUrl = current?.challenge ? challengeHref(current.challenge.id, current.challenge.mapId)
    : current?.multiChallenge ? `/multi-challenge/${current.multiChallenge.id}` : "/admin?tab=pending";
  const target = current?.map?.name || current?.campaign?.name || current?.proposedTarget?.mapName || t("common.multiChallenge");
  const challengeName = (current?.challenge ? challengeDisplayName(current.challenge) : undefined)
    || current?.multiChallenge?.name || current?.proposedTarget?.challengeName || t("challenge.kicker");
  const stored = catalog.value.submissions.find((item) => item.id === recordId.value);
  return {
    id: recordId.value,
    label: `${current?.displayName ?? ""} · ${target} · ${challengeName}`,
    returnHref: challengeUrl,
    videoUrl: current?.videoUrl,
    rawVideoUrl: stored?.rawVideoUrl ?? fetched.value?.rawVideoUrl,
    playerNote: current?.note,
    verifierNote: current?.verifierNote,
    achievedAt: current?.achievedAt,
    reviewedAt: current?.reviewedAt,
    duration: current?.duration,
    tags: [...(current?.badgeTags ?? []), ...(current?.noteTags ?? [])],
    adminManaged: Boolean(adminRecords.value.find((item) => item.id === recordId.value)),
  };
});
</script>

<template>
  <PageShell v-if="!catalogReady">
    <LoadState variant="page" :label="t('record.loading')" />
  </PageShell>
  <PageShell v-else-if="missing || !view" :eyebrow="t('record.kicker')" :title="t('record.notFound')" :lede="t('record.notFoundLede')">
    <div><LinkButton to="/golden" type="primary">{{ t("record.backToGolden") }}</LinkButton></div>
  </PageShell>
  <PageShell v-else>
    <header class="hero">
      <div class="hero-text">
        <p class="kicker">{{ t("record.kicker") }}</p>
        <h1 class="title">{{ view.displayName }}</h1>
        <nav class="crumbs" :aria-label="t('record.breadcrumb')">
          <template v-if="view.proposedTarget">
            <span>{{ view.proposedTarget.campaignName }}</span>
            <span>{{ view.proposedTarget.mapName }}</span>
            <span>{{ view.proposedTarget.challengeName }}</span>
          </template>
          <template v-else>
            <RouterLink v-if="view.campaign" :to="`/campaign/${view.campaign.id}`">{{ view.campaign.name }}</RouterLink>
            <RouterLink v-if="view.map" :to="`/map/${view.map.id}`">{{ view.map.name }}</RouterLink>
            <RouterLink v-if="view.challenge" :to="challengeHref(view.challenge.id, view.challenge.mapId)">{{ challengeDisplayName(view.challenge) }}</RouterLink>
            <RouterLink v-if="view.multiChallenge" :to="`/multi-challenge/${view.multiChallenge.id}`">{{ view.multiChallenge.name }}</RouterLink>
          </template>
        </nav>
        <div v-if="view.badgeTags.length" class="badges">
          <em v-for="tag in view.badgeTags" :key="tag.id" class="badge" :style="{ '--tag-tone': tag.color }">{{ tag.text }}</em>
        </div>
      </div>
      <div class="ratings">
        <HistRatingBadge v-if="view.map && view.challenge" :map-id="view.map.id" size="lg" />
        <TierBadge v-if="view.tier" :tier="view.tier" size="lg" />
      </div>
    </header>

    <!-- 撤回入口只对本人出现；撤回后这条记录进回收站，由管理员决定去留。 -->
    <PanelBlock :title="t('record.detail')">
      <template #actions>
        <WithdrawSubmission :record-id="view.id" :player-id="view.playerId" />
      </template>
      <div class="grid">
        <div class="cell">
          <span class="cell-label">{{ t("common.players") }}</span>
          <div class="cell-value">
            <RouterLink v-if="view.player" :to="`/player/${view.player.id}`" class="link">{{ view.displayName }}</RouterLink>
            <template v-else>{{ view.displayName }}</template>
          </div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.achievedAt") }}</span>
          <div class="cell-value">{{ formatBeijingDateTime(view.achievedAt, false, notRecorded) }}</div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.status") }}</span>
          <div class="cell-value"><span class="status" :data-status="view.status">{{ statusLabel }}</span></div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.duration") }}</span>
          <div class="cell-value">{{ view.duration || notRecorded }}</div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.opinionField") }}</span>
          <div class="cell-value">
            <span class="opinion">
              {{ opinionText }} · {{ opinionTierText }}
              <RecordOpinionEditor :record="view" @saved="refreshCatalog()" />
            </span>
          </div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.links") }}</span>
          <div class="cell-value">
            <span class="links">
              <a v-if="view.videoUrl" :href="view.videoUrl" target="_blank" rel="noreferrer" class="link">{{ t("record.video") }}</a>
              <a v-if="view.rawVideoUrl" :href="view.rawVideoUrl" target="_blank" rel="noreferrer" class="link">{{ t("record.rawVideo") }}</a>
              <template v-if="!view.videoUrl && !view.rawVideoUrl">{{ t("common.none") }}</template>
            </span>
          </div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.reviewer") }}</span>
          <div class="cell-value">{{ view.reviewer || notRecorded }}</div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("record.reviewedAt") }}</span>
          <div class="cell-value">{{ formatBeijingDateTime(view.reviewedAt, false, notRecorded) }}</div>
        </div>
      </div>
    </PanelBlock>

    <PanelBlock :title="t('record.notesAndTags')">
      <div class="notes">
        <div class="cell">
          <span class="cell-label">{{ t("record.playerNote") }}</span>
          <div class="cell-value">{{ view.note || t("common.none") }}</div>
        </div>
        <div class="cell">
          <span class="cell-label">{{ t("records.verifierNote") }}</span>
          <div class="cell-value">{{ view.verifierNote || t("common.none") }}</div>
        </div>
        <div v-if="view.normalTags.length || view.noteTags.length" class="cell">
          <span class="cell-label">{{ t("records.tags") }}</span>
          <div class="cell-value">
            <div class="tags">
              <span v-for="tag in view.normalTags" :key="tag" class="tag">{{ tag }}</span>
              <span v-for="tag in view.noteTags" :key="tag.id" class="tag tag-note">{{ tag.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </PanelBlock>

    <AdminRecordDetailEditor :record="editable" @saved="refreshCatalog()" />
  </PageShell>
</template>

<style scoped>
.hero { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-5); flex-wrap: wrap; }
.hero-text { display: grid; gap: var(--sp-3); min-width: 0; }
.kicker {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
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
  overflow-wrap: anywhere;
}

/* 面包屑用「/」分隔，最后一级是当前挑战 */
.crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--fg-subtle); }
.crumbs > * + *::before { content: "/"; margin-right: var(--sp-2); color: var(--fg-disabled); }
.crumbs a { color: var(--fg-secondary); }
@media (hover: hover) {
  .crumbs a:hover { color: var(--link); }
}

.badges { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.badge {
  padding: 2px var(--sp-2);
  border: 1px solid var(--tag-tone, var(--border-default));
  border-radius: var(--r-sm);
  font-style: normal;
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--tag-tone, var(--fg-muted));
}
.ratings { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }

/* ── 字段网格 ───────────────────────────────────────────── */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4) var(--sp-5); }
.notes { display: grid; gap: var(--sp-4); }

.cell { display: grid; gap: var(--sp-1); min-width: 0; }
.cell-label { font-size: var(--fs-micro); letter-spacing: .06em; color: var(--fg-subtle); }
.cell-value { font-size: var(--fs-body); line-height: var(--lh-snug); color: var(--fg-default); overflow-wrap: anywhere; }

.link { color: var(--link); }
@media (hover: hover) {
  .link:hover { color: var(--link-hover); text-decoration: underline; }
}
.links { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
.opinion { display: inline-flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 状态用色点表示，不做整块填充 */
.status { display: inline-flex; align-items: center; gap: var(--sp-2); }
.status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--status-tone, var(--border-strong)); }
.status[data-status="accepted"] { --status-tone: var(--ok-600); }
.status[data-status="pending"] { --status-tone: var(--accent-500); }
.status[data-status="rejected"] { --status-tone: var(--danger-500); }
.status[data-status="hidden"] { --status-tone: var(--n-500); }

.tags { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.tag {
  padding: 2px var(--sp-2);
  border: var(--hairline);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  /* 导入标签里混进过长串（URL、成句的说明），没有这两行会把胶囊顶出容器 ——
     .tags 是 flex，换行只发生在标签之间，标签内部不换。 */
  max-width: 100%;
  overflow-wrap: anywhere;
}
/* 与记录表的 .tag-note 同色。不要借 Tier 色：用户一改自定义配色，
   验证者备注就跟着变色。 */
.tag-note { border-color: var(--fg-subtle); color: var(--fg-subtle); }
</style>
