<script setup lang="ts">
/**
 * 地图包页：页头 + 地图 / 多地图挑战两个页签。
 *
 * 层级只靠缩进与细线表达，挑战行交给共用的 ChallengeRow ——
 * 这一页与「所有地图」的地图包视图渲染的本是同一种东西。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NSelect, NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { isRatedTier, isTierCode, ratedTierOrder, tierIndex } from "@shared/tiers";
import { challengeDisplayName, challengeVariantOrder, compareChallengeNames } from "@shared/labels";
import type { Campaign, MapItem, MultiMapChallenge, DifficultyCode } from "@shared/types";
import { catalog, catalogReady } from "@/lib/catalog";
import { clearCount, submissionsForChallenge } from "@/lib/projection";
import { getCampaignMultiMapChallenges } from "@/lib/selectors";
import { challengeHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import EntityPage from "@/components/EntityPage.vue";
import EntityHero from "@/components/EntityHero.vue";
import MissingEntity from "@/components/MissingEntity.vue";
import LocalizedName from "@/components/LocalizedName.vue";
import LoadState from "@/components/LoadState.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import ChallengeRow from "@/components/ChallengeRow.vue";
import ChallengeRows from "@/components/ChallengeRows.vue";
import CampaignFavoriteButton from "@/components/CampaignFavoriteButton.vue";
import AdminEntityTools from "@/components/AdminEntityTools.vue";

const props = defineProps<{ id: string }>();

const { t } = useLanguage();
const { showStandardChallenges } = storeToRefs(useDisplayStore());

const campaignId = computed(() => Number(props.id));
const campaign = computed<Campaign | undefined>(() => catalog.value.campaigns.find((item) => item.id === campaignId.value));
const publicationUrl = computed(() => {
  const url = campaign.value?.gameBananaUrl || campaign.value?.url;
  return url && url !== "#" ? url : undefined;
});

type MapEntry = { map: MapItem; challenges: Array<{ id: number; mapId: number; name: string; tier: DifficultyCode; clearCount: number }> };

const tab = ref<"maps" | "multi">("maps");
const mapSort = ref<"lobby" | "difficulty">("lobby");
const direction = ref<"asc" | "desc">("asc");

/* 首屏先把页头和占位画出来，下一帧再算这份很重的列表。 */
const ready = shallowRef(false);
requestAnimationFrame(() => { ready.value = true; });

watch(mapSort, () => { direction.value = "asc"; });
watch(campaignId, () => { tab.value = "maps"; mapSort.value = "lobby"; direction.value = "asc"; });

const tierAllowed = (tier: string | null | undefined): tier is DifficultyCode =>
  tier === "undetermined" || (showStandardChallenges.value ? isRatedTier(tier) : isTierCode(tier));

const mapItems = computed<MapEntry[]>(() => {
  if (!ready.value || !catalogReady.value) return [];
  const allChallenges = catalog.value.challenges;
  return catalog.value.maps
    .filter((map) => map.campaignId === campaignId.value)
    .map((map) => {
      /* 挑战顺序以管理员保存的目录顺序为准；没保存过的才按名称与难度排。 */
      const raw = allChallenges.filter((challenge) => challenge.mapId === map.id && tierAllowed(challenge.tier));
      const order = raw.map((challenge) => challenge.id);
      const challenges = raw
        .map((challenge) => ({ ...challenge, tier: challenge.tier as DifficultyCode, clearCount: clearCount(challenge.id) }))
        .sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
          return compareChallengeNames(challengeDisplayName(a), challengeDisplayName(b))
            || tierIndex(b.tier) - tierIndex(a.tier)
            || challengeVariantOrder(challengeDisplayName(a)) - challengeVariantOrder(challengeDisplayName(b))
            || challengeDisplayName(a).localeCompare(challengeDisplayName(b));
        });
      return { map, challenges };
    })
    .filter((item) => item.challenges.length > 0);
});

/** 每张地图的难度向量：先比最难的挑战，相同再比次难的。分段草莓不参与。 */
function mapDifficultyVector(items: Array<{ name: string; tier: DifficultyCode }>) {
  return items
    .filter((challenge) => !/(?:^|\[|\s)(Golden|Silver|Berry)\s+\d+\b/i.test(challenge.name))
    .sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier) || compareChallengeNames(challengeDisplayName(a), challengeDisplayName(b)))
    .map((challenge) => tierIndex(challenge.tier));
}

function compareMapDifficulty(a: MapEntry, b: MapEntry) {
  const aVector = mapDifficultyVector(a.challenges);
  const bVector = mapDifficultyVector(b.challenges);
  const length = Math.max(aVector.length, bVector.length);
  for (let index = 0; index < length; index += 1) {
    const aTier = aVector[index] ?? ratedTierOrder.length;
    const bTier = bVector[index] ?? ratedTierOrder.length;
    // 正序固定为简单到困难。
    if (aTier !== bTier) return bTier - aTier;
  }
  return a.map.name.localeCompare(b.map.name, "en", { sensitivity: "base" });
}

type MapGroup = { key: string; label: string; cnLabel: string; aliases: string[]; color: string; items: MapEntry[] };

const mapGroups = computed<MapGroup[]>(() => {
  if (!mapItems.value.length) return [];
  const ascending = [...mapItems.value].sort(compareMapDifficulty);
  const flat = (items: MapEntry[]): MapGroup[] => [{ key: "", label: "", cnLabel: "", aliases: [], color: "", items }];

  if (mapSort.value === "difficulty") {
    return flat(direction.value === "asc" ? ascending : [...ascending].reverse());
  }

  const halls = catalog.value.campaignHalls.filter((hall) => hall.campaignId === campaignId.value);
  const savedOrder = catalog.value.campaignOrders[String(campaignId.value)] || [];
  if (!halls.length && !savedOrder.length) {
    return flat(direction.value === "asc" ? ascending : [...ascending].reverse());
  }

  const byId = new Map(mapItems.value.map((item) => [item.map.id, item]));
  const assigned = new Set(halls.flatMap((hall) => hall.mapIds || []));
  const hallTokens = [...halls].sort((a, b) => a.order - b.order).map((hall) => `hall:${hall.id}`);
  const mapTokens = mapItems.value.filter((item) => !assigned.has(item.map.id)).map((item) => `map:${item.map.id}`);
  const allTokens = [...hallTokens, ...mapTokens];
  const ordered = [...savedOrder.filter((token) => allTokens.includes(token)), ...allTokens.filter((token) => !savedOrder.includes(token))];
  const tokens = direction.value === "asc" ? ordered : [...ordered].reverse();

  return tokens.flatMap<MapGroup>((token) => {
    if (token.startsWith("map:")) {
      const item = byId.get(Number(token.slice(4)));
      return item ? [{ key: token, label: "", cnLabel: "", aliases: [], color: "", items: [item] }] : [];
    }
    const hall = halls.find((item) => item.id === Number(token.slice(5)));
    if (!hall) return [];
    return [{
      key: token, label: hall.name, cnLabel: hall.cnName || "", aliases: hall.aliases || [], color: hall.color,
      items: (hall.mapIds || []).map((id) => byId.get(id)).filter((item): item is MapEntry => Boolean(item)),
    }];
  }).filter((group) => Boolean(group.label) || group.items.length > 0);
});

/** `All Chapters Deathless [C]` 这类名字拆成「基名 + 挑战后缀」，同基名归一组。 */
function splitMultiName(name: string) {
  const match = name.match(/^(.*?)\s*\[(C\/FC|C|FC)\]\s*$/i);
  return match ? { base: match[1].trim(), challenge: match[2].toUpperCase() } : { base: name, challenge: name };
}

const multiGroups = computed(() => {
  if (!ready.value) return [];
  const groups = new Map<string, { name: string; items: Array<MultiMapChallenge & { shortName: string }> }>();
  for (const item of getCampaignMultiMapChallenges(campaignId.value)) {
    if (!tierAllowed(item.tier)) continue;
    const parsed = splitMultiName(item.name);
    const current = groups.get(parsed.base) ?? { name: parsed.base, items: [] };
    current.items.push({ ...item, shortName: parsed.challenge });
    groups.set(parsed.base, current);
  }
  return [...groups.values()]
    .sort((a, b) => {
      const aHardest = Math.min(...a.items.map((item) => tierIndex(item.tier)));
      const bHardest = Math.min(...b.items.map((item) => tierIndex(item.tier)));
      return bHardest - aHardest || a.name.localeCompare(b.name);
    })
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => tierIndex(b.tier) - tierIndex(a.tier) || a.shortName.localeCompare(b.shortName)),
    }));
});

const sortOptions = computed(() => [
  { value: "lobby", label: t("campaign.byLobby") },
  { value: "difficulty", label: t("maps.difficultySort") },
]);

const rowFor = (challenge: { id: number; mapId: number; name: string; tier: DifficultyCode; clearCount: number }) => ({
  id: challenge.id,
  name: challengeDisplayName(challenge),
  tier: challenge.tier,
  clearCount: challenge.clearCount,
  href: challengeHref(challenge.id, challenge.mapId),
  records: submissionsForChallenge(challenge.id),
});

const multiRowFor = (challenge: MultiMapChallenge & { shortName: string }) => ({
  id: challenge.id,
  name: challenge.shortName,
  tier: challenge.tier,
  clearCount: clearCount(challenge.id),
  href: `/multi-challenge/${challenge.id}`,
  records: submissionsForChallenge(challenge.id),
});
</script>

<template>
  <EntityPage v-if="!catalogReady">
    <LoadState variant="page" :label="t('entity.loadingCampaign')" />
  </EntityPage>
  <MissingEntity v-else-if="!campaign" label="entity.missingCampaign" />
  <EntityPage v-else>
    <EntityHero :kicker="t('common.campaigns')" :banner="campaign.banner">
      <template #title><LocalizedName :name="campaign.name" :cn-name="campaign.cnName" /></template>
      <template #actions>
        <CampaignFavoriteButton :campaign-id="campaign.id" />
        <NButton v-if="publicationUrl" tag="a" :href="publicationUrl" target="_blank" rel="noreferrer">{{ t("entity.publication") }}</NButton>
      </template>
    </EntityHero>

    <AdminEntityTools kind="campaign" :id="campaign.id" :label="campaign.name" />

    <section class="panel">
      <div class="toolbar">
        <NTabs show-scroll-button v-model:value="tab" type="line" size="small" justify-content="space-around" class="view-tabs">
          <NTab name="maps">{{ t("common.maps") }}</NTab>
          <NTab name="multi">{{ t("common.multiChallenge") }}</NTab>
        </NTabs>
        <div v-if="tab === 'maps' && ready && mapItems.length" class="tools">
          <NSelect v-model:value="mapSort" :options="sortOptions" size="small" class="sort" :aria-label="t('campaign.mapSort')" />
          <NButton
            size="small"
            :aria-label="direction === 'asc' ? t('maps.toDescending') : t('maps.toAscending')"
            @click="direction = direction === 'asc' ? 'desc' : 'asc'"
          >
            <span class="dir" :data-desc="direction === 'desc' || undefined" aria-hidden="true" />
            {{ direction === "asc" ? t("maps.ascending") : t("maps.descending") }}
          </NButton>
          <span class="count">{{ t("maps.mapsCount", { count: mapItems.length }) }}</span>
        </div>
      </div>

      <LoadState v-if="!ready" :label="t('campaign.loading')" />

      <template v-else-if="tab === 'maps'">
        <LoadState v-if="!mapItems.length" state="empty" :label="t('campaign.emptyMaps')" />
        <div v-else class="groups">
          <div v-for="group in mapGroups" :key="group.key" class="group">
            <!-- 大厅色只做标题左侧的一小段标记：它与 Tier 色同属高饱和，
                 铺成整条色脊就会跟每行的难度色抢注意力。 -->
            <h3 v-if="group.label" class="lobby" :style="{ '--lobby-color': group.color }">
              <LocalizedName :name="group.label" :cn-name="group.cnLabel" :aliases="group.aliases" inline />
              <small>{{ t("maps.mapsCount", { count: group.items.length }) }}</small>
            </h3>
            <div v-for="{ map, challenges } in group.items" :key="map.id" class="map">
              <h4 class="map-name">
                <RouterLink :to="`/map/${map.id}`">
                  <LocalizedName :name="map.name" :cn-name="map.cnName" :aliases="map.searchAliases" inline truncate />
                </RouterLink>
                <HistRatingBadge :map-id="map.id" />
              </h4>
              <ChallengeRows>
                <ChallengeRow v-for="challenge in challenges" :key="challenge.id" :challenge="rowFor(challenge)" />
              </ChallengeRows>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <LoadState v-if="!multiGroups.length" state="empty" :label="t('campaign.emptyMulti')" />
        <div v-else class="groups">
          <div v-for="group in multiGroups" :key="group.name" class="map">
            <h4 class="map-name pseudo-map">{{ group.name }}</h4>
            <ChallengeRows>
              <ChallengeRow v-for="challenge in group.items" :key="challenge.id" :challenge="multiRowFor(challenge)" />
            </ChallengeRows>
          </div>
        </div>
      </template>
    </section>
  </EntityPage>
</template>

<style scoped>
.panel { display: grid; gap: var(--sp-5); min-width: 0; }

/* 与「所有地图」的工具条同一套：页签在左，排序与计数在右。 */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.tools { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.view-tabs { flex: 0 0 auto; width: 200px; }
.sort { width: 128px; }

.dir {
  width: 0;
  height: 0;
  margin-right: var(--sp-1);
  border-inline: 4px solid transparent;
  border-bottom: 6px solid currentColor;
  transition: transform var(--dur-fast) var(--ease);
}
.dir[data-desc] { transform: rotate(180deg); }

.count { font-size: var(--fs-sm); color: var(--fg-subtle); white-space: nowrap; }

.groups { display: grid; gap: var(--sp-5); }
.group { display: grid; gap: var(--sp-4); min-width: 0; }

.lobby {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  letter-spacing: -.01em;
  color: var(--fg-default);
}
.lobby::before {
  content: "";
  flex: 0 0 auto;
  align-self: center;
  width: var(--rail-w);
  height: 1em;
  margin-right: calc(var(--sp-2) * -1);
  border-radius: 1px;
  background: var(--lobby-color, var(--border-strong));
}
.lobby small {
  flex: 0 0 auto;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  font-weight: var(--fw-normal);
  letter-spacing: 0;
  color: var(--fg-subtle);
}

.map { display: grid; gap: var(--sp-1); min-width: 0; }

/* 16px，明确大于下面 14px 的挑战行 —— 父级不能比子级弱 */
.map-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: var(--sp-2) 0 var(--sp-1) var(--sp-4);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  line-height: var(--lh-snug);
  color: var(--fg-default);
}
.map-name a { color: var(--fg-default); }
@media (hover: hover) {
  .map-name a:hover { color: var(--link); }
}
/* 多地图挑战的「地图名」其实是挑战组名，不可点 */
.pseudo-map { color: var(--fg-secondary); }
</style>
