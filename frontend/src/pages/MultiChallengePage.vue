<script setup lang="ts">
/**
 * 多地图挑战页。
 *
 * 与单地图挑战的区别是它不挂在某一张地图下，而是直接属于地图包，
 * 因此保留独立路由，没有并入地图页。
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { catalog, catalogReady } from "@/lib/catalog";
import { getCampaign, getMultiMapChallenge } from "@/lib/selectors";
import { hiddenSubmissionsForChallenge, submissionsForChallenge } from "@/lib/projection";
import { overlayFor } from "@/lib/admin-overlay";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import EntityPage from "@/components/EntityPage.vue";
import MissingEntity from "@/components/MissingEntity.vue";
import LocalizedName from "@/components/LocalizedName.vue";
import LoadState from "@/components/LoadState.vue";
import NoticeBox from "@/components/NoticeBox.vue";
import TierBadge from "@/components/TierBadge.vue";
import ChallengeStats from "@/components/ChallengeStats.vue";
import RecordTable from "@/components/RecordTable.vue";
import WishlistButton from "@/components/WishlistButton.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LinkButton from "@/components/LinkButton.vue";
import AdminEntityTools from "@/components/AdminEntityTools.vue";

const props = defineProps<{ id: string }>();

const { t } = useLanguage();
const { adminMode } = storeToRefs(useSessionStore());

const challengeId = computed(() => Number(props.id));
const challenge = computed(() => getMultiMapChallenge(challengeId.value));
const campaign = computed(() => (challenge.value ? getCampaign(challenge.value.campaignId) : undefined));

const overlay = computed(() => overlayFor(adminMode.value));
const records = computed(() => (challenge.value ? submissionsForChallenge(challenge.value.id, overlay.value) : []));
const hidden = computed(() => (adminMode.value && challenge.value
  ? hiddenSubmissionsForChallenge(challenge.value.id, overlay.value)
  : []));
const shown = computed(() => (adminMode.value ? [...records.value, ...hidden.value] : records.value));
const clears = computed(() => new Set(records.value.map((record) => record.playerId)).size);

const recordsSubtitle = computed(() => {
  const base = t("common.recordsCount", { count: records.value.length });
  return adminMode.value && hidden.value.length ? `${base} · ${t("records.hiddenCount", { count: hidden.value.length })}` : base;
});

// 目录还没到时不能断言挑战不存在。
const missing = computed(() => catalogReady.value && catalog.value.multiMapChallenges.length > 0 && !challenge.value);
</script>

<template>
  <EntityPage v-if="!catalogReady">
    <LoadState variant="page" :label="t('entity.loadingChallenge')" />
  </EntityPage>
  <MissingEntity v-else-if="missing" label="entity.missingChallenge" />
  <EntityPage v-else-if="challenge">
    <header class="head">
      <div class="head-main">
        <p class="kicker">{{ t("common.multiChallenge") }}</p>
        <h1 class="title">{{ challenge.name }}</h1>
        <p v-if="campaign" class="meta">
          {{ t("entity.inCampaign") }} ·
          <RouterLink :to="`/campaign/${campaign.id}`"><LocalizedName :name="campaign.name" :cn-name="campaign.cnName" inline /></RouterLink>
        </p>
        <div class="badges">
          <TierBadge :tier="challenge.tier" size="lg" />
          <WishlistButton :challenge-id="challenge.id" />
        </div>
      </div>
      <dl class="stat">
        <dt>{{ t("common.clears") }}</dt>
        <dd>{{ clears }}</dd>
      </dl>
    </header>

    <NoticeBox :text="challenge.notice" />
    <AdminEntityTools kind="challenge" :id="challenge.id" :label="`${campaign?.name ?? ''} · ${challenge.name}`" />

    <ChallengeStats :records="records" />
    <PanelBlock :title="t('common.records')" :subtitle="recordsSubtitle">
      <template #actions>
        <LinkButton :to="`/submit?challengeId=${challenge.id}`" type="primary" size="small">{{ t("common.submitChallenge") }}</LinkButton>
      </template>
      <RecordTable :records="shown" />
    </PanelBlock>
  </EntityPage>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-5);
  flex-wrap: wrap;
  padding-bottom: var(--sp-4);
  border-bottom: var(--hairline);
}
.head-main { display: grid; gap: var(--sp-2); min-width: 0; flex: 1 1 auto; }

.kicker { margin: 0; font-size: var(--fs-micro); font-weight: var(--fw-medium); letter-spacing: .12em; color: var(--fg-subtle); }
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
.meta { margin: 0; font-size: var(--fs-sm); color: var(--fg-muted); }
.meta a { color: var(--fg-secondary); }
@media (hover: hover) {
  .meta a:hover { color: var(--link); }
}
.badges { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-2); }

/* 完成人数是这一屏最该被一眼看到的数字 */
.stat { margin: 0; display: grid; gap: 2px; justify-items: end; flex: 0 0 auto; }
.stat dt { font-size: var(--fs-micro); color: var(--fg-subtle); }
.stat dd {
  margin: 0;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: 1;
  letter-spacing: -.02em;
  color: var(--fg-default);
}

@media (max-width: 640px) {
  .head { align-items: flex-start; gap: var(--sp-4); }
  .stat { justify-items: start; }
}
</style>
