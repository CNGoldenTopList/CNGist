<script setup lang="ts">
/**
 * 地图页 —— 也是挑战视图的唯一实现。
 *
 * 选中的挑战由 URL 的 `?c=` 承载：它是这个站的原子（难度、记录、愿望单
 * 全部挂在 challenge 上），不该藏在组件的局部状态里。这样刷新不丢、
 * 单个挑战也分享得出去。
 */
import { computed, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { challengeDisplayName, challengeVariantOrder, compareChallengeNames } from "@shared/labels";
import { isRatedTier, tierIndex, tierOrder } from "@shared/tiers";
import { catalog, catalogReady } from "@/lib/catalog";
import { getMap } from "@/lib/selectors";
import { hiddenSubmissionsForChallenge, submissionsForChallenge } from "@/lib/projection";
import { overlayFor } from "@/lib/admin-overlay";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import EntityPage from "@/components/EntityPage.vue";
import EntityHero from "@/components/EntityHero.vue";
import MissingEntity from "@/components/MissingEntity.vue";
import LocalizedName from "@/components/LocalizedName.vue";
import LoadState from "@/components/LoadState.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
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
const route = useRoute();
const router = useRouter();
const { adminMode } = storeToRefs(useSessionStore());

const mapId = computed(() => Number(props.id));
const map = computed(() => getMap(mapId.value));
const campaign = computed(() => (map.value?.campaignId
  ? catalog.value.campaigns.find((item) => item.id === map.value?.campaignId)
  : undefined));

/** 挑战顺序以目录顺序为准；没保存过的才按名称与难度排。 */
const challenges = computed(() => {
  const rows = catalog.value.challenges.filter((challenge) => challenge.mapId === mapId.value);
  const order = rows.map((challenge) => challenge.id);
  return [...rows].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    const segmentOrder = compareChallengeNames(challengeDisplayName(a), challengeDisplayName(b));
    if (segmentOrder) return segmentOrder;
    if (isRatedTier(a.tier) && isRatedTier(b.tier)) {
      return tierIndex(b.tier) - tierIndex(a.tier)
        || challengeVariantOrder(challengeDisplayName(a)) - challengeVariantOrder(challengeDisplayName(b))
        || challengeDisplayName(a).localeCompare(challengeDisplayName(b));
    }
    if (isRatedTier(a.tier)) return -1;
    if (isRatedTier(b.tier)) return 1;
    return (a.tier ? tierOrder.length : tierOrder.length + 1) - (b.tier ? tierOrder.length : tierOrder.length + 1);
  });
});

/** 选中态的唯一真相是 URL。参数缺失或指向别的地图的挑战时回落到第一项。 */
const wanted = computed(() => Number(route.query.c));
const selected = computed(() => challenges.value.find((challenge) => challenge.id === wanted.value) ?? challenges.value[0]);

/* 把地址栏收敛到实际选中的那一项，让它永远是可分享的。
   用 replace 而不是 push：这不是一次导航，不该在历史里留一格。 */
watch(selected, (challenge) => {
  if (!challenge || wanted.value === challenge.id) return;
  void router.replace({ path: route.path, query: { ...route.query, c: String(challenge.id) } });
}, { immediate: true });

/** 切换挑战是一次真实的导航，进历史，浏览器后退能退回上一个挑战。 */
const pick = (id: number) => router.push({ path: route.path, query: { ...route.query, c: String(id) } });

const overlay = computed(() => overlayFor(adminMode.value));
const records = computed(() => (selected.value ? submissionsForChallenge(selected.value.id, overlay.value) : []));
const hidden = computed(() => (adminMode.value && selected.value
  ? hiddenSubmissionsForChallenge(selected.value.id, overlay.value)
  : []));
const shown = computed(() => (adminMode.value ? [...records.value, ...hidden.value] : records.value));
const clears = computed(() => new Set(records.value.map((record) => record.playerId)).size);

const recordsSubtitle = computed(() => {
  const base = t("common.recordsCount", { count: records.value.length });
  return adminMode.value && hidden.value.length ? `${base} · ${t("records.hiddenCount", { count: hidden.value.length })}` : base;
});

const tabValue = computed({
  get: () => selected.value?.id ?? 0,
  set: (value: number) => { void pick(value); },
});
</script>

<template>
  <EntityPage v-if="!catalogReady">
    <LoadState variant="page" :label="t('entity.loadingMap')" />
  </EntityPage>
  <MissingEntity v-else-if="!map" label="entity.missingMap" />
  <EntityPage v-else>
    <EntityHero :kicker="t('common.maps')" :banner="map.banner">
      <template #title><LocalizedName :name="map.name" :cn-name="map.cnName" /></template>
      <template #meta>
        <template v-if="campaign">
          {{ t("entity.inCampaign") }} ·
          <RouterLink :to="`/campaign/${campaign.id}`"><LocalizedName :name="campaign.name" :cn-name="campaign.cnName" inline /></RouterLink>
        </template>
        <template v-else>{{ t("entity.standalone") }}</template>
      </template>
      <template #actions><HistRatingBadge :map-id="map.id" size="lg" /></template>
    </EntityHero>

    <NoticeBox :text="map.notice" />
    <AdminEntityTools kind="map" :id="map.id" :label="map.name" />

    <p v-if="!selected" class="empty">{{ t("challenge.emptyMap") }}</p>
    <section v-else class="explorer">
      <!-- 大多数地图只有一个挑战项目 —— 那种情况下选择器纯粹是噪音。 -->
      <NTabs show-scroll-button
        v-if="challenges.length > 1"
        v-model:value="tabValue"
        class="challenge-tabs"
        justify-content="space-around"
        :tab-style="{ paddingInline: 'var(--sp-3)' }"
        type="line"
        size="small"
        :aria-label="t('challenge.pick')"
      >
        <NTab v-for="challenge in challenges" :key="challenge.id" :name="challenge.id">
          {{ challengeDisplayName(challenge) }}
        </NTab>
      </NTabs>

      <header class="head">
        <div class="head-main">
          <p class="kicker">{{ t("challenge.kicker") }}</p>
          <h2 class="challenge-name">{{ challengeDisplayName(selected) }}</h2>
          <div v-if="selected.tier" class="badges">
            <TierBadge :tier="selected.tier" size="lg" />
          </div>
        </div>
        <div class="head-actions">
          <dl class="stat">
            <dt>{{ t("common.clears") }}</dt>
            <dd>{{ clears }}</dd>
          </dl>
          <WishlistButton :challenge-id="selected.id" class="head-wishlist" />
        </div>
      </header>

      <NoticeBox :text="selected.notice" />
      <ChallengeStats :records="records" />

      <PanelBlock :title="t('common.records')" :subtitle="recordsSubtitle">
        <template #actions>
          <LinkButton :to="`/submit?challengeId=${selected.id}`" type="primary" size="small">{{ t("common.submitChallenge") }}</LinkButton>
        </template>
        <RecordTable :records="shown" />
      </PanelBlock>
    </section>
  </EntityPage>
</template>

<style scoped>
.explorer { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-5); min-width: 0; }
.explorer > * { min-width: 0; }
.challenge-tabs { width: 100%; max-width: 100%; }

/* 标题区与操作栏分组，移动端切换挑战时保持相同的阅读顺序。 */
.head {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-5);
  flex-wrap: wrap;
  padding-bottom: var(--sp-4);
}
.head-main { display: grid; gap: var(--sp-2); min-width: 0; flex: 1 1 auto; }
.head-actions { display: contents; }

.kicker { margin: 0; font-size: var(--fs-micro); font-weight: var(--fw-medium); letter-spacing: .12em; color: var(--fg-subtle); }
.challenge-name {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.015em;
  color: var(--fg-default);
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.badges { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 完成人数是这一屏最该被一眼看到的数字，用等宽体给足字号 */
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

.empty { margin: 0; padding: var(--sp-7) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    padding-bottom: 0;
  }
  .head-main {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
  }
  .kicker { grid-column: 1; grid-row: 1; letter-spacing: .06em; }
  .badges { grid-column: 2; grid-row: 1; justify-content: flex-end; }
  .badges :deep(.tier-badge) {
    height: 28px;
    padding-inline: var(--sp-3);
    font-size: var(--fs-sm);
  }
  .challenge-name {
    grid-column: 1 / -1;
    font-size: 1.375rem;
    line-height: 1.35;
    text-wrap: initial;
  }
  .head-actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-4);
    padding-block: var(--sp-3);
  }
  .stat { display: flex; align-items: baseline; gap: var(--sp-2); }
  .stat dd { font-size: 1.25rem; }
  .head-wishlist { min-width: 0; justify-content: flex-end; }
}
</style>
