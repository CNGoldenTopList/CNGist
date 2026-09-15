<script setup lang="ts">
/**
 * 所有地图目录 —— 440 个地图包 / 1864 张地图 / 2439 个挑战。
 *
 * 三层树（地图包 → 地图 → 挑战）只用三种手段分层：缩进、细线、留白。
 * 唯一的颜色留给每个挑战行左侧的 Tier 色脊 —— 几千行铺下来，难度分布
 * 不用读字就能看出来，这是这个站最该有的浏览方式。
 *
 * 层级必须是 包 24px > 地图 16px > 挑战 14px，逐级收敛。父级读起来
 * 比子级弱就说明层级是倒的。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NInput, NSelect, NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { isTierCode, tierIndex, tierMeta, tierOrder } from "@shared/tiers";
import { challengeDisplayName, challengeVariantOrder, compareChallengeNames } from "@shared/labels";
import { searchable } from "@shared/search";
import type { Challenge, MultiMapChallenge, Submission, TierCode } from "@shared/types";
import { catalog, catalogReady } from "@/lib/catalog";
import { clearCount, submissionsForChallenge } from "@/lib/projection";
import { getCampaignMultiMapChallenges } from "@/lib/selectors";
import { challengeHref, multiChallengeHref } from "@/lib/routes";
import { recommendationStats } from "@/lib/stats";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import LocalizedName from "@/components/LocalizedName.vue";
import LoadState from "@/components/LoadState.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import ChallengeRow from "@/components/ChallengeRow.vue";
import ChallengeRows from "@/components/ChallengeRows.vue";
import WindowVirtualList from "@/components/WindowVirtualList.vue";
import TierRangeSlider from "@/components/TierRangeSlider.vue";

const { t } = useLanguage();
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

type ViewMode = "packages" | "challenges";
type Direction = "asc" | "desc";
type DisplayChallenge = {
  id: number; mapId?: number; name: string; tier: TierCode;
  clearCount: number; href: string; records: Submission[];
};
type DirectoryUnit = { id: string; mapId?: number; name: string; cnName?: string; aliases?: string[]; href?: string; multi?: boolean; challenges: DisplayChallenge[] };
type DirectoryPackage = { id: string; kind: "campaign" | "single"; name: string; cnName?: string; href: string; units: DirectoryUnit[]; mapCount: number };
type DirectoryChallenge = DisplayChallenge & {
  packageName: string; packageCnName?: string; mapName: string; mapCnName?: string; multi?: boolean;
};

const viewMode = ref<ViewMode>("packages");
const query = ref("");
const packageSort = ref<"alphabet" | "clears" | "mapCount">("alphabet");
const challengeSort = ref<"alphabet" | "difficulty" | "recommendation" | "clears">("alphabet");
const direction = ref<Direction>("asc");
const advanced = ref(false);
const minMapCount = ref("");
const maxMapCount = ref("");
const minClears = ref("");
const maxClears = ref("");
const minRec = ref("");
const maxRec = ref("");
const tierLow = ref(0);
const tierHigh = ref(tierOrder.length - 1);

/* 这份列表很重（几千行），首屏先把外壳和占位画出来，下一帧再算。 */
const ready = shallowRef(false);
requestAnimationFrame(() => { ready.value = true; });

const hasAdvanced = computed(() =>
  Boolean((viewMode.value === "packages" && (minMapCount.value || maxMapCount.value))
    || minClears.value || maxClears.value || minRec.value || maxRec.value
    || tierLow.value !== 0 || tierHigh.value !== tierOrder.length - 1));

function resetAdvanced() {
  minMapCount.value = ""; maxMapCount.value = "";
  minClears.value = ""; maxClears.value = "";
  minRec.value = ""; maxRec.value = "";
  tierLow.value = 0; tierHigh.value = tierOrder.length - 1;
}

function challengePass(challenge: DisplayChallenge) {
  const index = tierIndex(challenge.tier);
  if (index < tierLow.value || index > tierHigh.value) return false;
  const minC = minClears.value === "" ? null : Number(minClears.value);
  const maxC = maxClears.value === "" ? null : Number(maxClears.value);
  if (minC !== null && challenge.clearCount < minC) return false;
  if (maxC !== null && challenge.clearCount > maxC) return false;
  const rec = recommendationStats(challenge.records).percent;
  const minR = minRec.value === "" ? null : Number(minRec.value);
  const maxR = maxRec.value === "" ? null : Number(maxRec.value);
  if ((minR !== null || maxR !== null) && rec === null) return false;
  if (minR !== null && (rec ?? -1) < minR) return false;
  if (maxR !== null && (rec ?? 101) > maxR) return false;
  return true;
}

const makeChallenge = (challenge: Challenge & { tier: TierCode }): DisplayChallenge => ({
  id: challenge.id, mapId: challenge.mapId, name: challengeDisplayName(challenge), tier: challenge.tier,
  clearCount: clearCount(challenge.id), href: challengeHref(challenge.id, challenge.mapId),
  records: submissionsForChallenge(challenge.id),
});

const makeMultiChallenge = (challenge: MultiMapChallenge & { tier: TierCode; shortName: string }): DisplayChallenge => ({
  id: challenge.id, name: challenge.shortName, tier: challenge.tier,
  clearCount: clearCount(challenge.id), href: multiChallengeHref(challenge.id),
  records: submissionsForChallenge(challenge.id),
});

/** `All Chapters Deathless [C]` 这类名字拆成「基名 + 挑战后缀」，同基名归一组。 */
function splitMultiName(name: string) {
  const match = name.match(/^(.*?)\s*\[(C\/FC|C|FC)\]\s*$/i);
  return match ? { base: match[1].trim(), challenge: match[2].toUpperCase() } : { base: name, challenge: name };
}

function groupMultiChallenges(items: MultiMapChallenge[]) {
  const groups = new Map<string, { name: string; items: Array<MultiMapChallenge & { tier: TierCode; shortName: string }> }>();
  for (const item of items) {
    if (!isTierCode(item.tier)) continue;
    const parsed = splitMultiName(item.name);
    const current = groups.get(parsed.base) ?? { name: parsed.base, items: [] };
    current.items.push({ ...item, tier: item.tier, shortName: parsed.challenge });
    groups.set(parsed.base, current);
  }
  return [...groups.values()];
}

const sortChallenges = (rows: DisplayChallenge[]) => rows.sort((a, b) =>
  compareChallengeNames(a.name, b.name)
  || tierIndex(b.tier) - tierIndex(a.tier)
  || challengeVariantOrder(a.name) - challengeVariantOrder(b.name)
  || a.name.localeCompare(b.name));

const unitClears = (unit: DirectoryUnit) => unit.challenges.reduce((sum, challenge) => sum + challenge.clearCount, 0);
const packageClears = (pkg: DirectoryPackage) => pkg.units.reduce((sum, unit) => sum + unitClears(unit), 0);

/** 地图包内地图按「最难的正式 C 挑战」排序；带编号的分段草莓不参与。 */
function unitHardestTier(unit: DirectoryUnit) {
  if (unit.multi) return unit.challenges.length ? Math.min(...unit.challenges.map((c) => tierIndex(c.tier))) : tierOrder.length;
  const formalC = unit.challenges.filter((challenge) =>
    /(?:^|\s|\[)(?:C\/FC|C)(?:\]|\s*)$/i.test(challenge.name)
    && !/(?:^|\[|\s)(Golden|Silver|Berry)\s+\d+\b/i.test(challenge.name));
  return formalC.length ? Math.min(...formalC.map((c) => tierIndex(c.tier))) : tierOrder.length;
}

function compareValue(a: number | string, b: number | string) {
  const mul = direction.value === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "en", { sensitivity: "base" }) * mul;
  return (Number(a) - Number(b)) * mul;
}

const packages = computed<DirectoryPackage[]>(() => {
  if (!ready.value || !catalogReady.value || viewMode.value !== "packages") return [];
  const { campaigns, maps, challenges } = catalog.value;
  const minMaps = minMapCount.value === "" ? null : Number(minMapCount.value);
  const maxMaps = maxMapCount.value === "" ? null : Number(maxMapCount.value);

  const campaignPackages = campaigns.flatMap<DirectoryPackage>((campaign) => {
    const campaignMatch = searchable([campaign.name, campaign.cnName, campaign.shortName], campaign.searchAliases, query.value);
    const normalUnits = maps.filter((map) => map.campaignId === campaign.id).flatMap<DirectoryUnit>((map) => {
      if (!campaignMatch && !searchable([map.name, map.cnName], map.searchAliases, query.value)) return [];
      const rows = sortChallenges(challenges
        .filter((challenge): challenge is Challenge & { tier: TierCode } => challenge.mapId === map.id && isTierCode(challenge.tier))
        .map(makeChallenge).filter(challengePass));
      return rows.length ? [{ id: `map-${map.id}`, mapId: map.id, name: map.name, cnName: map.cnName, aliases: map.searchAliases, href: `/map/${map.id}`, challenges: rows }] : [];
    });
    const multiUnits = groupMultiChallenges(getCampaignMultiMapChallenges(campaign.id)).flatMap<DirectoryUnit>((group) => {
      if (!campaignMatch && !searchable([group.name], undefined, query.value)) return [];
      const rows = sortChallenges(group.items.map(makeMultiChallenge).filter(challengePass));
      return rows.length ? [{ id: `multi-${campaign.id}-${group.name}`, name: group.name, multi: true, challenges: rows }] : [];
    });
    const units = [...normalUnits, ...multiUnits].sort((a, b) => unitHardestTier(a) - unitHardestTier(b) || a.name.localeCompare(b.name));
    const mapCount = units.filter((unit) => !unit.multi).length;
    if (!units.length || (minMaps !== null && mapCount < minMaps) || (maxMaps !== null && mapCount > maxMaps)) return [];
    return [{ id: `campaign-${campaign.id}`, kind: "campaign", name: campaign.name, cnName: campaign.cnName, href: `/campaign/${campaign.id}`, units, mapCount }];
  });

  const standalonePackages = maps.filter((map) => !map.campaignId).flatMap<DirectoryPackage>((map) => {
    if (!searchable([map.name, map.cnName], map.searchAliases, query.value)) return [];
    const rows = sortChallenges(challenges
      .filter((challenge): challenge is Challenge & { tier: TierCode } => challenge.mapId === map.id && isTierCode(challenge.tier))
      .map(makeChallenge).filter(challengePass));
    if (!rows.length || (minMaps !== null && minMaps > 1) || (maxMaps !== null && maxMaps < 1)) return [];
    return [{
      id: `single-${map.id}`, kind: "single", name: map.name, cnName: map.cnName, href: `/map/${map.id}`, mapCount: 1,
      units: [{ id: `map-${map.id}`, mapId: map.id, name: map.name, cnName: map.cnName, aliases: map.searchAliases, href: `/map/${map.id}`, challenges: rows }],
    }];
  });

  return [...campaignPackages, ...standalonePackages].sort((a, b) => {
    const pick = (pkg: DirectoryPackage) =>
      packageSort.value === "alphabet" ? pkg.name : packageSort.value === "mapCount" ? pkg.mapCount : packageClears(pkg);
    return compareValue(pick(a), pick(b)) || a.name.localeCompare(b.name);
  });
});

const challengeItems = computed<DirectoryChallenge[]>(() => {
  if (!ready.value || !catalogReady.value || viewMode.value !== "challenges") return [];
  const { campaigns, maps, challenges } = catalog.value;
  const items: DirectoryChallenge[] = [];

  for (const campaign of campaigns) {
    const packageMatch = searchable([campaign.name, campaign.cnName, campaign.shortName], campaign.searchAliases, query.value);
    for (const map of maps.filter((item) => item.campaignId === campaign.id)) {
      const mapMatch = searchable([map.name, map.cnName], map.searchAliases, query.value);
      for (const challenge of challenges.filter((item) => item.mapId === map.id)) {
        if (!isTierCode(challenge.tier)) continue;
        if (!packageMatch && !mapMatch && !searchable([challenge.name, challengeDisplayName(challenge)], undefined, query.value)) continue;
        const item = makeChallenge(challenge as Challenge & { tier: TierCode });
        if (challengePass(item)) items.push({ ...item, packageName: campaign.name, packageCnName: campaign.cnName, mapName: map.name, mapCnName: map.cnName });
      }
    }
    for (const group of groupMultiChallenges(getCampaignMultiMapChallenges(campaign.id))) {
      if (!packageMatch && !searchable([group.name], undefined, query.value)) continue;
      for (const challenge of group.items) {
        const item = makeMultiChallenge(challenge);
        if (challengePass(item)) items.push({ ...item, packageName: campaign.name, packageCnName: campaign.cnName, mapName: group.name, multi: true });
      }
    }
  }

  for (const map of maps.filter((item) => !item.campaignId)) {
    const mapMatch = searchable([map.name, map.cnName], map.searchAliases, query.value);
    for (const challenge of challenges.filter((item) => item.mapId === map.id)) {
      if (!isTierCode(challenge.tier)) continue;
      if (!mapMatch && !searchable([challenge.name, challengeDisplayName(challenge)], undefined, query.value)) continue;
      const item = makeChallenge(challenge as Challenge & { tier: TierCode });
      if (challengePass(item)) items.push({ ...item, packageName: map.name, packageCnName: map.cnName, mapName: map.name, mapCnName: map.cnName });
    }
  }

  return items.sort((a, b) => {
    const pick = (item: DirectoryChallenge) =>
      challengeSort.value === "alphabet" ? `${item.mapName} ${item.name}`
        : challengeSort.value === "difficulty" ? tierOrder.length - tierIndex(item.tier)
          : challengeSort.value === "clears" ? item.clearCount
            : recommendationStats(item.records).percent ?? -1;
    return compareValue(pick(a), pick(b)) || a.name.localeCompare(b.name);
  });
});

type DirectoryRow = { key: string; estimate: number } & (
  | { type: "package"; pkg: DirectoryPackage; first: boolean }
  | { type: "unit"; unit: DirectoryUnit }
  | { type: "challenge"; challenge: DisplayChallenge; first: boolean }
);
const packageRows = computed<DirectoryRow[]>(() => packages.value.flatMap((pkg, packageIndex) => {
  const rows: DirectoryRow[] = [{ key: pkg.id, estimate: packageIndex ? 100 : 76, type: "package", pkg, first: packageIndex === 0 }];
  for (const unit of pkg.units) {
    if (pkg.kind === "campaign") rows.push({ key: unit.id, estimate: 44, type: "unit", unit });
    unit.challenges.forEach((challenge, index) => rows.push({
      key: `challenge-${challenge.id}`, estimate: 42, type: "challenge", challenge, first: index === 0,
    }));
  }
  return rows;
}));
const flatRows = computed(() => challengeItems.value.map((item) => ({ key: `challenge-${item.id}`, estimate: 58, item })));

const shownCount = computed(() => (viewMode.value === "packages" ? packages.value.length : challengeItems.value.length));

const sortOptions = computed(() => (viewMode.value === "packages"
  ? [
    { value: "alphabet", label: t("maps.alphabet") },
    { value: "clears", label: t("maps.clearsSort") },
    { value: "mapCount", label: t("maps.mapCountSort") },
  ]
  : [
    { value: "alphabet", label: t("maps.alphabet") },
    { value: "difficulty", label: t("maps.difficultySort") },
    { value: "recommendation", label: t("maps.recommendationSort") },
    { value: "clears", label: t("maps.clearsSort") },
  ]));

const activeSort = computed({
  get: () => (viewMode.value === "packages" ? packageSort.value : challengeSort.value),
  set: (value: string) => {
    if (viewMode.value === "packages") packageSort.value = value as typeof packageSort.value;
    else challengeSort.value = value as typeof challengeSort.value;
  },
});

watch(viewMode, (mode) => {
  if (mode === "challenges") challengeSort.value = "alphabet";
  direction.value = "asc";
});

const digits = (value: string) => value.replace(/\D/g, "");

/** 地图包的难度跨度，排成一条微型色谱：只画实际出现过的档位，
    因此条的长短本身就是跨度。这是「合集」与「单图」在形态上的分野。 */
function spectrumTiers(pkg: DirectoryPackage) {
  const seen = new Set(pkg.units.flatMap((unit) => unit.challenges.map((challenge) => challenge.tier)));
  const present = tierOrder.filter((tier) => seen.has(tier));
  return present.length >= 2 ? present : [];
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div class="head-text">
        <p class="eyebrow">{{ t("maps.directory") }}</p>
        <h1 class="title">{{ t("nav.maps") }}</h1>
        <p class="lede">{{ t("maps.lede") }}</p>
      </div>
      <div class="search-wrap">
        <NInput v-model:value="query" clearable :placeholder="t('maps.placeholder')" :aria-label="t('maps.searchLabel')" />
      </div>
    </header>

    <!-- 几百个条目，滚到一半也要能改排序和筛选，因此工具条吸顶。 -->
    <div class="toolbar">
      <NTabs show-scroll-button v-model:value="viewMode" type="line" size="small" justify-content="space-around" class="view-tabs">
        <NTab name="packages">{{ t("maps.byPack") }}</NTab>
        <NTab name="challenges">{{ t("maps.byChallenge") }}</NTab>
      </NTabs>
      <div class="tools">
        <NSelect v-model:value="activeSort" :options="sortOptions" size="small" class="sort" :aria-label="t('maps.sort')" />
        <NButton
          size="small"
          :aria-label="direction === 'asc' ? t('maps.toDescending') : t('maps.toAscending')"
          @click="direction = direction === 'asc' ? 'desc' : 'asc'"
        >
          <span class="dir" :data-desc="direction === 'desc' || undefined" aria-hidden="true" />
          {{ direction === "asc" ? t("maps.ascending") : t("maps.descending") }}
        </NButton>
        <NButton size="small" :type="advanced || hasAdvanced ? 'primary' : 'default'" :aria-expanded="advanced" @click="advanced = !advanced">
          {{ t("maps.filter") }}
          <span v-if="hasAdvanced" class="dot" :aria-label="t('maps.filtersActive')" />
        </NButton>
        <span class="count">
          <template v-if="ready">{{ t(viewMode === "packages" ? "maps.packCount" : "maps.challengeCount", { count: shownCount }) }}</template>
          <template v-else>{{ t("maps.counting") }}</template>
        </span>
      </div>
    </div>

    <div v-if="advanced" class="filters">
      <div class="ranges">
        <label v-if="viewMode === 'packages'" class="range">
          <span class="filter-label">{{ t("maps.mapCount") }}</span>
          <span class="range-pair">
            <NInput :value="minMapCount" size="small" :placeholder="t('maps.min')" :aria-label="t('maps.minimum', { label: t('maps.mapCount') })" @update:value="(v: string) => minMapCount = digits(v)" />
            <span aria-hidden="true">–</span>
            <NInput :value="maxMapCount" size="small" :placeholder="t('maps.max')" :aria-label="t('maps.maximum', { label: t('maps.mapCount') })" @update:value="(v: string) => maxMapCount = digits(v)" />
          </span>
        </label>
        <label class="range">
          <span class="filter-label">{{ t("maps.clearCount") }}</span>
          <span class="range-pair">
            <NInput :value="minClears" size="small" :placeholder="t('maps.min')" :aria-label="t('maps.minimum', { label: t('maps.clearCount') })" @update:value="(v: string) => minClears = digits(v)" />
            <span aria-hidden="true">–</span>
            <NInput :value="maxClears" size="small" :placeholder="t('maps.max')" :aria-label="t('maps.maximum', { label: t('maps.clearCount') })" @update:value="(v: string) => maxClears = digits(v)" />
          </span>
        </label>
        <label class="range">
          <span class="filter-label">{{ t("maps.withUnit", { label: t("maps.recommendation"), unit: "%" }) }}</span>
          <span class="range-pair">
            <NInput :value="minRec" size="small" :placeholder="t('maps.min')" :aria-label="t('maps.minimum', { label: t('maps.recommendation') })" @update:value="(v: string) => minRec = digits(v)" />
            <span aria-hidden="true">–</span>
            <NInput :value="maxRec" size="small" :placeholder="t('maps.max')" :aria-label="t('maps.maximum', { label: t('maps.recommendation') })" @update:value="(v: string) => maxRec = digits(v)" />
          </span>
        </label>
      </div>
      <div class="tier-filter">
        <span class="filter-label">{{ t("common.tierRange", { term: compactTierLabels ? "T" : "Tier" }) }}</span>
        <TierRangeSlider v-model:lower="tierLow" v-model:upper="tierHigh" dense />
      </div>
      <div class="filter-foot">
        <NButton quaternary size="small" :disabled="!hasAdvanced" @click="resetAdvanced">{{ t("maps.clearFilters") }}</NButton>
      </div>
    </div>

    <LoadState v-if="!ready || !catalogReady" :label="t('maps.loading')" variant="page" />
    <LoadState v-else-if="!shownCount" state="empty" :label="t('maps.empty')" />

    <WindowVirtualList v-else-if="viewMode === 'packages'" key="packages" :items="packageRows">
      <template #default="{ item: row }">
        <div v-if="row.type === 'package'" class="package-title" :class="[row.pkg.kind, { first: row.first }]">
          <header class="package-head">
            <p class="kind">{{ row.pkg.kind === "campaign" ? t("common.campaigns") : t("maps.single") }}</p>
            <h2 class="package-name">
              <RouterLink :to="row.pkg.href"><LocalizedName :name="row.pkg.name" :cn-name="row.pkg.cnName" /></RouterLink>
            </h2>
            <div class="package-meta">
              <HistRatingBadge v-if="row.pkg.kind === 'single'" :map-id="row.pkg.units[0]?.mapId" />
              <span v-if="row.pkg.kind === 'campaign' && spectrumTiers(row.pkg).length" class="spectrum" role="img" :aria-label="t('maps.spectrum', { easiest: tierMeta[spectrumTiers(row.pkg)[spectrumTiers(row.pkg).length - 1]].short, hardest: tierMeta[spectrumTiers(row.pkg)[0]].short })">
                <i v-for="tier in spectrumTiers(row.pkg)" :key="tier" :style="{ background: tierColors[tier] }" />
              </span>
              <small>{{ row.pkg.kind === "campaign" ? t("maps.mapsCount", { count: row.pkg.mapCount }) : t("maps.challengesCount", { count: row.pkg.units[0]?.challenges.length ?? 0 }) }}</small>
            </div>
          </header>
        </div>
        <div v-else-if="row.type === 'unit'" class="unit-title">
          <h3 class="unit-name">
            <RouterLink v-if="row.unit.href" :to="row.unit.href">
              <LocalizedName :name="row.unit.name" :cn-name="row.unit.cnName" :aliases="row.unit.aliases" inline truncate />
            </RouterLink>
            <span v-else>{{ row.unit.name }}</span>
            <HistRatingBadge v-if="!row.unit.multi" :map-id="row.unit.mapId" />
            <em v-if="row.unit.multi" class="multi-tag">{{ t("maps.multi") }}</em>
          </h3>
        </div>
        <ChallengeRows v-else class="virtual-challenges" :class="{ continued: !row.first }">
          <ChallengeRow :challenge="row.challenge" />
        </ChallengeRows>
      </template>
    </WindowVirtualList>

    <WindowVirtualList v-else key="challenges" :items="flatRows">
      <template #default="{ item: row, index }">
        <ChallengeRows class="virtual-challenges" :class="{ continued: index > 0 }">
          <ChallengeRow :challenge="row.item" :hist-map-id="row.item.mapId">
            <template #title>
              <LocalizedName :name="row.item.mapName" :cn-name="row.item.mapCnName" inline truncate />
              <em class="row-challenge-name">{{ row.item.name }}</em>
            </template>
            <template #sub>
              <LocalizedName :name="row.item.packageName" :cn-name="row.item.packageCnName" inline truncate />{{ row.item.multi ? t("maps.multiSuffix") : "" }}
            </template>
          </ChallengeRow>
        </ChallengeRows>
      </template>
    </WindowVirtualList>
  </div>
</template>

<style scoped>
.page {
  /* 与地图页、地图包页、意见箱、提交页统一 680px。四列本来就是固定槽位，
     加宽只会让眼睛在标题与右侧数据之间来回横扫。 */
  max-width: 680px;
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-7) 96px;
  display: grid;
  gap: var(--sp-5);
}

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-6); flex-wrap: wrap; }
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
}
.lede { margin: 0; max-width: 52ch; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }
.search-wrap { flex: 0 1 320px; min-width: 220px; }

/* top 取页首高度，吸顶的工具条与页首叠在一起不会互相遮挡。 */
.toolbar {
  position: sticky;
  top: 64px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding-block: var(--sp-3);
  background: var(--bg-page);
}
.view-tabs { flex: 0 0 auto; width: 200px; }
.tools { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.sort { width: 128px; }

/* 排序方向：一个纯 CSS 三角，翻转即倒序 */
.dir {
  width: 0;
  height: 0;
  margin-right: var(--sp-1);
  border-inline: 4px solid transparent;
  border-bottom: 6px solid currentColor;
  transition: transform var(--dur-fast) var(--ease);
}
.dir[data-desc] { transform: rotate(180deg); }
/* 有筛选条件时按钮上的小圆点 */
.dot { width: 6px; height: 6px; margin-left: var(--sp-1); border-radius: 50%; background: currentColor; }

.count { margin-left: var(--sp-2); font-size: var(--fs-sm); color: var(--fg-subtle); white-space: nowrap; }

.filters { display: grid; gap: var(--sp-5); padding: var(--sp-5); background: var(--bg-inset); border-radius: var(--r-md); }
.ranges { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4); }
.range { display: grid; gap: var(--sp-2); }
.range-pair { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--sp-2); }
.range-pair > span { color: var(--fg-subtle); }
.tier-filter { display: grid; gap: var(--sp-3); }
.filter-label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
.filter-foot { display: flex; justify-content: flex-end; }

/* ── 地图包 ─────────────────────────────────────────────── */
.package-title { padding-top: var(--sp-6); padding-bottom: var(--sp-3); min-width: 0; }
.package-title.first { padding-top: 0; }
.unit-title { padding-top: var(--sp-3); padding-bottom: var(--sp-1); }
.virtual-challenges.continued :deep(li > a) { border-top: var(--hairline); }

.package-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-4);
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
}

/* 「地图包」与「单图」是两类东西，这个标签把它们分开。 */
.kind {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .16em;
  color: var(--fg-subtle);
}
.single .kind { color: var(--fg-disabled); }

.package-name {
  /* 24px 标题配 ~16px 中文名。中文名不加粗：标题本身是 800，
     汉字在 600 上的实心程度已经接近拉丁字母的 800。 */
  --cn-size: .68em;
  --cn-weight: var(--fw-normal);
  margin: 0;
  min-width: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.02em;
  text-wrap: balance;
}
/* 单图不是合集，标题降一档，让真正的地图包在页面上立得住 */
.single .package-name { --cn-size: .78em; font-size: var(--fs-h3); font-weight: var(--fw-medium); }
.package-name a { color: var(--fg-default); }
@media (hover: hover) {
  .package-name a:hover { color: var(--link); }
}

.package-meta { display: flex; align-items: center; gap: var(--sp-3); flex: 0 0 auto; }
.package-meta small {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
  white-space: nowrap;
}

/* 微型色谱：只画出这个包里实际出现过的难度档位，条的长短就是跨度。 */
.spectrum { display: flex; gap: 1px; align-items: center; }
.spectrum i { display: block; width: 4px; height: 12px; border-radius: 1px; }

/* ── 地图：16px，明确大于下面 14px 的挑战行。 ── */
.unit-name {
  --cn-weight: var(--fw-normal);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0;
  padding: var(--sp-2) 0 var(--sp-1) var(--sp-4);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  line-height: var(--lh-snug);
  color: var(--fg-default);
}
/* 弹性子项默认不小于内容宽度，不给 min-width: 0 的话里面的截断永远不触发，
   长地图名会把这一行顶出视口。 */
.unit-name > a, .unit-name > span { min-width: 0; }
.unit-name a { color: var(--fg-default); }
@media (hover: hover) {
  .unit-name a:hover { color: var(--link); }
}
.multi-tag {
  padding: 1px var(--sp-2);
  border: var(--hairline);
  border-radius: var(--r-pill);
  font-size: var(--fs-micro);
  font-style: normal;
  font-weight: var(--fw-normal);
  color: var(--fg-subtle);
}

.row-challenge-name { margin-inline-start: var(--sp-2); font-style: italic; color: var(--fg-muted); }

@media (max-width: 640px) {
  .page { padding-inline: var(--sp-4); padding-block: var(--sp-5) 72px; }
  .toolbar { top: 56px; align-items: stretch; }
  .search-wrap { flex: 1 1 100%; }
  .tools { width: 100%; }
  .count { margin-left: auto; }
}
</style>
