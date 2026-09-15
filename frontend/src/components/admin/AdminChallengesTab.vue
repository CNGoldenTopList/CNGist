<script setup lang="ts">
/**
 * 挑战管理：地图包 → 地图 → 挑战三级树，以及资料编辑、大厅编排、分割合并。
 *
 * 大厅、大厅内地图与根级顺序同属一次布局事务，任何一处改动都整块提交 ——
 * 分三次发会在中途留下「地图既不在大厅里也不在根级」的状态。
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NColorPicker, NInput, NModal, NSelect } from "naive-ui";
import { mapHistValue, histLabel } from "@shared/hist";
import { isTierCode, tierIndex, tierOrder } from "@shared/tiers";
import { CAMPAIGN_MENU_FAVORITE_SLOTS, CAMPAIGN_MENU_FIXED_SLOTS } from "@shared/campaign-menu";
import { searchable } from "@shared/search";
import type { CampaignHall } from "@shared/types";
import { catalog } from "@/lib/catalog";
import { challengeContext } from "@/lib/projection";
import { getCampaignHalls, getCampaignMaps, getMapChallenges } from "@/lib/selectors";
import { sendAdminCommand } from "@/lib/admin-resources";
import { confirmAction, toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import TierBadge from "@/components/TierBadge.vue";
import TierSelect from "@/components/TierSelect.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import LinkButton from "@/components/LinkButton.vue";
import AdminPager from "@/components/admin/AdminPager.vue";
import AdminImageUpload from "@/components/admin/AdminImageUpload.vue";
import ChallengeGraphEditor from "@/components/admin/ChallengeGraphEditor.vue";

const props = defineProps<{ query: string; targetKind?: string; targetId?: number }>();

const PAGE_SIZE = 6;
const page = ref(1);
const expandedCampaign = ref<number | null>(null);
const expandedMap = ref<string | null>(null);

const campaignEditId = ref<number | null>(null);
const campaignEdit = ref({ name: "", cnName: "", aliases: "", banner: "", bannerPreview: "", publicationUrl: "", notice: "" });
const mapEditId = ref<number | null>(null);
const mapEdit = ref({ name: "", cnName: "", aliases: "", banner: "", bannerPreview: "", notice: "", histRating: "none" });
const challengeEditId = ref<number | null>(null);
const challengeEdit = ref<{ name: string; tier: string | null; notice: string }>({ name: "", tier: "undetermined", notice: "" });

const hallCampaign = ref<number | null>(null);
const hallDraft = ref({ name: "", cnName: "", aliases: "", color: "#67c9ff" });
const dragToken = ref<string | null>(null);

const menuOpen = ref(false);
const menuFixedIds = ref<number[]>([]);
const menuFavoriteIds = ref<number[]>([]);
const menuQuery = ref("");
const menuDragId = ref<string | null>(null);

const operation = ref<{ type: "split" | "merge"; challengeId: number } | null>(null);
const operationDraft = ref({
  first: "", firstTier: "undetermined" as string | null, firstNotice: "",
  second: "", secondTier: "undetermined" as string | null, secondNotice: "",
  targetId: null as number | null, label: "", color: "#67c9ff", selected: [] as number[],
});
const graphMapId = ref<number | null>(null);

watch(() => props.query, () => { page.value = 1; });

/* 从前台「在后台打开」跳进来时，把那条链路上的节点都展开。 */
watch(() => [props.targetKind, props.targetId] as const, ([kind, id]) => {
  if (!id) return;
  if (kind === "campaign") expandedCampaign.value = id;
  if (kind === "map") {
    const map = catalog.value.maps.find((item) => item.id === id);
    if (map?.campaignId) expandedCampaign.value = map.campaignId;
    expandedMap.value = `map:${id}`;
  }
  if (kind === "challenge") {
    const challenge = catalog.value.challenges.find((item) => item.id === id);
    const map = catalog.value.maps.find((item) => item.id === challenge?.mapId);
    if (map?.campaignId) expandedCampaign.value = map.campaignId;
    if (map) expandedMap.value = `map:${map.id}`;
  }
}, { immediate: true });

async function runCommand(path: string, init: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}, success?: string) {
  try {
    await sendAdminCommand(path, init);
    if (success) toast.success(success);
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    return false;
  }
}

/* ── 列表 ──────────────────────────────────────────────────── */
const filtered = computed(() => catalog.value.campaigns.filter((campaign) => {
  if (!props.query.trim()) return true;
  const childMaps = getCampaignMaps(campaign.id);
  const haystack = [
    campaign.name, campaign.cnName ?? "", ...(campaign.searchAliases ?? []),
    ...childMaps.flatMap((map) => [map.name, map.cnName ?? "", ...(map.searchAliases ?? []),
      ...getMapChallenges(map.id).map((challenge) => challenge.name)]),
  ];
  return searchable(haystack, undefined, props.query);
}));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const splitAliases = (value: string) => value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);

/** 别名拆成数组；预览地址不入库，没换图时也不发 banner —— 发空串会把原封面清掉。 */
function catalogPatch<T extends { aliases: string; banner: string; bannerPreview: string }>(draft: T) {
  const { bannerPreview: _preview, banner, ...rest } = draft;
  return { ...rest, aliases: splitAliases(draft.aliases), ...(banner ? { banner } : {}) };
}

async function saveCatalogEdit(kind: "campaign" | "map" | "challenge", id: number, patch: object, confirmText: string, done: () => void) {
  const confirmed = await confirmAction({ title: "保存修改", content: confirmText, positiveText: "保存", negativeText: "取消" });
  if (!confirmed) return;
  if (await runCommand("/api/admin/catalog", { method: "PUT", body: { kind, id, ...patch } }, "已保存。")) done();
}

const openCampaignEdit = (campaign: (typeof catalog.value.campaigns)[number]) => {
  campaignEditId.value = campaign.id;
  campaignEdit.value = {
    name: campaign.name,
    cnName: campaign.cnName || "",
    aliases: (campaign.searchAliases || []).join("，"),
    banner: "",
    bannerPreview: campaign.banner || "",
    publicationUrl: campaign.gameBananaUrl || campaign.url || "",
    notice: campaign.blurb || "",
  };
};
const openMapEdit = (map: (typeof catalog.value.maps)[number]) => {
  mapEditId.value = map.id;
  mapEdit.value = {
    histRating: mapHistValue(map),
    name: map.name,
    cnName: map.cnName || "",
    aliases: (map.searchAliases || []).join("，"),
    banner: "",
    bannerPreview: map.banner || "",
    notice: map.notice || "",
  };
};
const openChallengeEdit = (challenge: { id: number; name: string; tier?: string | null; notice?: string }) => {
  challengeEditId.value = challenge.id;
  challengeEdit.value = { name: challenge.name, tier: challenge.tier || "undetermined", notice: challenge.notice || "" };
};

const histOptions = computed(() => [
  { value: "none", label: "无评级" },
  { value: "pending", label: "未定档" },
  ...[1, 2, 3, 4, 5].flatMap((stars) => (["lower", "upper"] as const).map((subTier) => ({
    value: `${stars}-${subTier}`,
    label: histLabel({ stars, subTier }),
  }))),
]);

async function softDelete(kind: "campaign" | "map" | "challenge", targetId: number, label: string) {
  const confirmed = await confirmAction({
    title: "移入回收站",
    content: `确认将「${label}」移入回收站？`,
    positiveText: "移入回收站",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void runCommand("/api/admin/trash", { body: { kind, targetId } }, "已移入回收站。");
}

/* ── 排序 ──────────────────────────────────────────────────── */
function moveWithin(order: number[], challengeId: number, delta: number, path: string) {
  const index = order.indexOf(challengeId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [order[next], order[index]];
  void runCommand(path, { method: "PUT", body: { challengeIds: order } });
}
const moveChallenge = (mapId: number, challengeId: number, delta: number) =>
  moveWithin(getMapChallenges(mapId).map((item) => item.id), challengeId, delta, `/api/admin/maps/${mapId}/order`);
const moveMultiChallenge = (campaignId: number, challengeId: number, delta: number) =>
  moveWithin(catalog.value.multiMapChallenges.filter((item) => item.campaignId === campaignId).map((item) => item.id),
    challengeId, delta, `/api/admin/campaigns/${campaignId}/challenge-order`);

/* ── 大厅编排 ──────────────────────────────────────────────── */
/** 地图按难度向量排；带编号的分段草莓不参与。 */
function mapDifficultyVector(mapId: number) {
  return getMapChallenges(mapId)
    .filter((challenge) => isTierCode(challenge.tier) && !/(?:^|\[|\s)(Golden|Silver|Berry)\s+\d+\b/i.test(challenge.name))
    .map((challenge) => tierIndex(challenge.tier!))
    .sort((a, b) => a - b);
}
function orderedMaps(campaignId: number) {
  return [...getCampaignMaps(campaignId)].sort((a, b) => {
    const av = mapDifficultyVector(a.id);
    const bv = mapDifficultyVector(b.id);
    for (let index = 0; index < Math.max(av.length, bv.length); index += 1) {
      const at = av[index] ?? tierOrder.length;
      const bt = bv[index] ?? tierOrder.length;
      if (at !== bt) return bt - at;
    }
    return a.name.localeCompare(b.name);
  });
}

function rootTokens(campaignId: number) {
  const halls = getCampaignHalls(campaignId);
  const assigned = new Set(halls.flatMap((hall) => hall.mapIds || []));
  const valid = new Set([
    ...halls.map((hall) => `hall:${hall.id}`),
    ...orderedMaps(campaignId).filter((map) => !assigned.has(map.id)).map((map) => `map:${map.id}`),
  ]);
  const configured = (catalog.value.campaignOrders[String(campaignId)] || []).filter((token) => valid.has(token));
  return [...configured, ...[...valid].filter((token) => !configured.includes(token))];
}

const saveLayout = (campaignId: number, halls: CampaignHall[], rootTokenList: string[], success?: string) =>
  runCommand(`/api/admin/campaigns/${campaignId}/layout`, { method: "PUT", body: { halls, rootTokens: rootTokenList } }, success);

async function addHall(campaignId: number) {
  if (!hallDraft.value.name.trim()) return;
  const halls = getCampaignHalls(campaignId);
  // 新大厅的编号由服务端分配；这里用负数占位，提交后目录会带回真实编号。
  const hall: CampaignHall = {
    id: -Date.now(),
    campaignId,
    name: hallDraft.value.name.trim(),
    cnName: hallDraft.value.cnName.trim() || undefined,
    aliases: splitAliases(hallDraft.value.aliases),
    color: hallDraft.value.color,
    order: halls.length + 1,
    mapIds: [],
  };
  if (await saveLayout(campaignId, [...halls, hall], [...rootTokens(campaignId), `hall:${hall.id}`], "大厅已创建。")) {
    hallDraft.value = { ...hallDraft.value, name: "", cnName: "", aliases: "" };
  }
}

function putMapInHall(campaignId: number, hallId: number, mapId: number) {
  const halls = getCampaignHalls(campaignId).map((hall) => (hall.id === hallId
    ? { ...hall, mapIds: Array.from(new Set([...(hall.mapIds || []), mapId])) }
    : { ...hall, mapIds: (hall.mapIds || []).filter((id) => id !== mapId) }));
  void saveLayout(campaignId, halls, rootTokens(campaignId).filter((token) => token !== `map:${mapId}`));
}

function moveRootToken(campaignId: number, token: string, before?: string) {
  const halls = getCampaignHalls(campaignId).map((hall) => (token.startsWith("map:")
    ? { ...hall, mapIds: (hall.mapIds || []).filter((id) => id !== Number(token.slice(4))) }
    : hall));
  const tokens = rootTokens(campaignId).filter((item) => item !== token);
  const index = before ? tokens.indexOf(before) : tokens.length;
  tokens.splice(index < 0 ? tokens.length : index, 0, token);
  void saveLayout(campaignId, halls, tokens);
}

const updateHall = (campaignId: number, hallId: number, patch: Partial<CampaignHall>) =>
  void saveLayout(campaignId, getCampaignHalls(campaignId).map((hall) => (hall.id === hallId ? { ...hall, ...patch } : hall)), rootTokens(campaignId));

async function deleteHall(campaignId: number, hallId: number) {
  const confirmed = await confirmAction({
    title: "删除大厅",
    content: "确认删除大厅？大厅内地图会回到游离状态。",
    positiveText: "删除",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  const hall = getCampaignHalls(campaignId).find((item) => item.id === hallId);
  const tokens = rootTokens(campaignId).flatMap((token) => (token === `hall:${hallId}`
    ? (hall?.mapIds || []).map((id) => `map:${id}`)
    : [token]));
  void saveLayout(campaignId, getCampaignHalls(campaignId).filter((item) => item.id !== hallId), tokens, "大厅已删除。");
}

function reorderHallMap(campaignId: number, hallId: number, mapId: number, beforeId: number) {
  const halls = getCampaignHalls(campaignId).map((hall) => {
    if (hall.id !== hallId) return hall;
    const ids = (hall.mapIds || []).filter((id) => id !== mapId);
    ids.splice(Math.max(0, ids.indexOf(beforeId)), 0, mapId);
    return { ...hall, mapIds: ids };
  });
  void saveLayout(campaignId, halls, rootTokens(campaignId));
}

/* ── 顶栏菜单 ──────────────────────────────────────────────── */
function openMenu() {
  menuFixedIds.value = [...catalog.value.campaignMenu.fixed];
  menuFavoriteIds.value = [...catalog.value.campaignMenu.favorites];
  menuOpen.value = true;
}

async function saveMenu() {
  if (menuFixedIds.value.length !== CAMPAIGN_MENU_FIXED_SLOTS || menuFavoriteIds.value.length !== CAMPAIGN_MENU_FAVORITE_SLOTS) {
    toast.error(`固定区需要 ${CAMPAIGN_MENU_FIXED_SLOTS} 项，默认收藏区需要 ${CAMPAIGN_MENU_FAVORITE_SLOTS} 项。`);
    return;
  }
  const confirmed = await confirmAction({
    title: "保存顶部菜单",
    content: "确认保存顶部地图包菜单修改？",
    positiveText: "保存",
    negativeText: "取消",
  });
  if (!confirmed) return;
  if (await runCommand("/api/admin/campaign-menu", {
    method: "PUT",
    body: { fixed: menuFixedIds.value, favorites: menuFavoriteIds.value },
  }, "顶部地图包菜单已更新。")) menuOpen.value = false;
}

function dropMenu(group: "fixed" | "favorite", id: number) {
  const prefix = `${group}:`;
  if (!menuDragId.value?.startsWith(prefix) || menuDragId.value === `${prefix}${id}`) return;
  const movedId = Number(menuDragId.value.slice(prefix.length));
  const list = group === "fixed" ? menuFixedIds : menuFavoriteIds;
  const next = list.value.filter((item) => item !== movedId);
  next.splice(next.indexOf(id), 0, movedId);
  list.value = next;
  menuDragId.value = null;
}

const menuPool = computed(() => catalog.value.campaigns
  .filter((campaign) => !menuFixedIds.value.includes(campaign.id)
    && !menuFavoriteIds.value.includes(campaign.id)
    && (!menuQuery.value.trim() || searchable([campaign.name, campaign.cnName], campaign.searchAliases, menuQuery.value)))
  .slice(0, 30));

const campaignName = (id: number) => catalog.value.campaigns.find((item) => item.id === id)?.name || String(id);
const campaignCn = (id: number) => catalog.value.campaigns.find((item) => item.id === id)?.cnName;

/* ── 分割 / 合并 ───────────────────────────────────────────── */
function openOperation(type: "split" | "merge", challengeId: number) {
  operation.value = { type, challengeId };
  operationDraft.value = {
    first: "", firstTier: "undetermined", firstNotice: "",
    second: "", secondTier: "undetermined", secondNotice: "",
    targetId: null, label: "", color: "#67c9ff", selected: [],
  };
}

async function saveOperation() {
  const current = operation.value;
  if (!current) return;
  const draft = operationDraft.value;
  const body = current.type === "split"
    ? {
      first: { name: draft.first.trim(), tier: draft.firstTier, notice: draft.firstNotice.trim() },
      second: { name: draft.second.trim(), tier: draft.secondTier, notice: draft.secondNotice.trim() },
      selected: draft.selected,
    }
    : { targetId: draft.targetId, label: draft.label.trim(), color: draft.color };
  if (await runCommand(`/api/admin/challenges/${current.challengeId}/${current.type}`, { body },
    current.type === "split" ? "挑战已分割。" : "挑战已合并。")) operation.value = null;
}

const splitRecords = computed(() => (operation.value
  ? catalog.value.submissions.filter((record) => record.challengeId === operation.value!.challengeId)
  : []));

const mergeTargets = computed(() => catalog.value.challenges
  .filter((item) => item.id !== operation.value?.challengeId)
  .map((item) => ({ value: item.id, label: challengeContext(item.id).label })));

const playerNameOf = (playerId: number) => catalog.value.players.find((item) => item.id === playerId)?.name || String(playerId);
</script>

<template>
  <div>
    <PanelBlock title="新建与全站设置">
      <div class="adm-actions">
        <LinkButton to="/admin/create/campaign">新建地图包</LinkButton>
        <LinkButton to="/admin/create/map">新建地图</LinkButton>
        <LinkButton to="/admin/create/challenge">新建挑战项目</LinkButton>
        <NButton quaternary @click="openMenu">管理顶部地图包菜单</NButton>
      </div>
    </PanelBlock>

    <div class="adm-tree">
      <article v-for="campaign in paged" :key="campaign.id" class="adm-node">
        <header class="adm-node-head">
          <NButton
            size="small"
            quaternary
            :aria-label="expandedCampaign === campaign.id ? '收起地图包' : '展开地图包'"
            @click="expandedCampaign = expandedCampaign === campaign.id ? null : campaign.id"
          >{{ expandedCampaign === campaign.id ? "−" : "+" }}</NButton>
          <img v-if="campaign.banner" class="adm-node-thumb" :src="campaign.banner" alt="" />
          <span class="adm-node-identity">
            <strong>{{ campaign.name }}</strong>
            <em>{{ campaign.cnName || "未填写中文名" }}</em>
          </span>
          <!-- 折叠状态下也要看得出这个包有没有多地图挑战，否则得逐个展开才知道。 -->
          <small class="adm-node-count">
            {{ getCampaignMaps(campaign.id).length }} 张地图{{
              catalog.multiMapChallenges.filter((item) => item.campaignId === campaign.id).length
                ? ` · ${catalog.multiMapChallenges.filter((item) => item.campaignId === campaign.id).length} 个多地图挑战` : ""
            }}
          </small>
          <NButton size="small" @click="openCampaignEdit(campaign)">修改资料</NButton>
          <NButton size="small" @click="hallCampaign = campaign.id">调整大厅排序</NButton>
          <LinkButton :to="`/admin/create/challenge?campaign=${campaign.id}`" size="small">新建多地图挑战</LinkButton>
          <NButton size="small" type="error" @click="softDelete('campaign', campaign.id, campaign.name)">删除</NButton>
        </header>

        <div v-if="expandedCampaign === campaign.id" class="map-nodes">
          <section v-for="map in getCampaignMaps(campaign.id)" :key="map.id" class="map-node">
            <header class="adm-node-head">
              <NButton
                size="small"
                quaternary
                :aria-label="expandedMap === `map:${map.id}` ? '收起地图' : '展开地图'"
                @click="expandedMap = expandedMap === `map:${map.id}` ? null : `map:${map.id}`"
              >{{ expandedMap === `map:${map.id}` ? "−" : "+" }}</NButton>
              <span class="adm-node-identity">
                <RouterLink :to="`/map/${map.id}`">{{ map.name }}</RouterLink>
                <em v-if="map.cnName">{{ map.cnName }}</em>
              </span>
              <HistRatingBadge :map-id="map.id" />
              <small class="adm-node-count">{{ getMapChallenges(map.id).length }} 个挑战</small>
              <NButton size="small" @click="openMapEdit(map)">修改资料</NButton>
              <NButton size="small" @click="graphMapId = map.id">挑战逻辑 DAG</NButton>
              <LinkButton :to="`/admin/create/challenge?map=${map.id}`" size="small">新建挑战</LinkButton>
              <NButton size="small" type="error" @click="softDelete('map', map.id, map.name)">删除</NButton>
            </header>
            <p v-if="map.notice" class="entity-notice">注意事项：{{ map.notice }}</p>

            <div v-if="expandedMap === `map:${map.id}`" class="challenge-rows">
              <div v-for="(challenge, index) in getMapChallenges(map.id)" :key="challenge.id" class="challenge-row">
                <span class="challenge-identity">
                  <RouterLink :to="`/challenge/${challenge.id}`">{{ challenge.name }}</RouterLink>
                </span>
                <TierBadge v-if="challenge.tier" :tier="challenge.tier" />
                <span v-else class="untiered">未定级</span>
                <div class="challenge-actions">
                  <NButton size="small" quaternary aria-label="上移" :disabled="index === 0" @click="moveChallenge(map.id, challenge.id, -1)">↑</NButton>
                  <NButton size="small" quaternary aria-label="下移" :disabled="index === getMapChallenges(map.id).length - 1" @click="moveChallenge(map.id, challenge.id, 1)">↓</NButton>
                  <NButton size="small" @click="openChallengeEdit(challenge)">修改资料</NButton>
                  <NButton size="small" @click="openOperation('split', challenge.id)">分割</NButton>
                  <NButton size="small" @click="openOperation('merge', challenge.id)">合并</NButton>
                  <NButton size="small" type="error" @click="softDelete('challenge', challenge.id, challenge.name)">删除</NButton>
                </div>
                <small v-if="challenge.notice" class="row-notice">{{ challenge.notice }}</small>
              </div>
            </div>
          </section>

          <!-- 大多数地图包没有多地图挑战，空节点就不画了。 -->
          <section
            v-if="catalog.multiMapChallenges.some((item) => item.campaignId === campaign.id)"
            class="map-node"
          >
            <header class="adm-node-head">
              <NButton
                size="small"
                quaternary
                :aria-label="expandedMap === `multi:${campaign.id}` ? '收起多地图挑战' : '展开多地图挑战'"
                @click="expandedMap = expandedMap === `multi:${campaign.id}` ? null : `multi:${campaign.id}`"
              >{{ expandedMap === `multi:${campaign.id}` ? "−" : "+" }}</NButton>
              <span class="adm-node-identity"><strong>多地图挑战</strong><em>不属于任何一张地图</em></span>
              <small class="adm-node-count">{{ catalog.multiMapChallenges.filter((item) => item.campaignId === campaign.id).length }} 个挑战</small>
              <LinkButton :to="`/admin/create/challenge?campaign=${campaign.id}`" size="small">新建多地图挑战</LinkButton>
            </header>
            <div v-if="expandedMap === `multi:${campaign.id}`" class="challenge-rows">
              <div
                v-for="(challenge, index) in catalog.multiMapChallenges.filter((item) => item.campaignId === campaign.id)"
                :key="challenge.id"
                class="challenge-row"
              >
                <span class="challenge-identity">
                  <RouterLink :to="`/multi-challenge/${challenge.id}`">{{ challenge.name }}</RouterLink>
                </span>
                <TierBadge v-if="challenge.tier" :tier="challenge.tier" />
                <span v-else class="untiered">未定级</span>
                <div class="challenge-actions">
                  <NButton size="small" quaternary aria-label="上移" :disabled="index === 0" @click="moveMultiChallenge(campaign.id, challenge.id, -1)">↑</NButton>
                  <NButton
                    size="small"
                    quaternary
                    aria-label="下移"
                    :disabled="index === catalog.multiMapChallenges.filter((item) => item.campaignId === campaign.id).length - 1"
                    @click="moveMultiChallenge(campaign.id, challenge.id, 1)"
                  >↓</NButton>
                  <NButton size="small" @click="openChallengeEdit(challenge)">修改资料</NButton>
                  <NButton size="small" type="error" @click="softDelete('challenge', challenge.id, challenge.name)">删除</NButton>
                </div>
                <small v-if="challenge.notice" class="row-notice">{{ challenge.notice }}</small>
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>

    <AdminPager v-model:page="page" :item-count="filtered.length" :page-size="PAGE_SIZE" />

    <!-- ── 顶部菜单编排 ───────────────────────────────────── -->
    <NModal
      v-model:show="menuOpen"
      preset="card"
      title="顶部「地图包」菜单"
      :bordered="false"
      style="max-width: 860px; width: calc(100vw - 32px)"
    >
      <template #header-extra>
        <span class="subtitle">上方 {{ CAMPAIGN_MENU_FIXED_SLOTS }} 项是全站固定区；下方 {{ CAMPAIGN_MENU_FAVORITE_SLOTS }} 项是用户尚未收藏时显示的默认收藏位。</span>
      </template>

      <FormField :label="`固定区（${menuFixedIds.length}/${CAMPAIGN_MENU_FIXED_SLOTS}）`">
        <div class="menu-list">
          <div
            v-for="id in menuFixedIds"
            :key="id"
            class="menu-row"
            draggable="true"
            @dragstart="menuDragId = `fixed:${id}`"
            @dragover.prevent
            @drop="dropMenu('fixed', id)"
          >
            <span>☰ {{ campaignName(id) }}{{ campaignCn(id) ? ` · ${campaignCn(id)}` : "" }}</span>
            <NButton size="small" quaternary @click="menuFixedIds = menuFixedIds.filter((item) => item !== id)">移除</NButton>
          </div>
        </div>
      </FormField>

      <FormField :label="`默认收藏位（${menuFavoriteIds.length}/${CAMPAIGN_MENU_FAVORITE_SLOTS}）`">
        <div class="menu-list menu-defaults">
          <div
            v-for="id in menuFavoriteIds"
            :key="id"
            class="menu-row"
            draggable="true"
            @dragstart="menuDragId = `favorite:${id}`"
            @dragover.prevent
            @drop="dropMenu('favorite', id)"
          >
            <span>☰ ☆ {{ campaignName(id) }}{{ campaignCn(id) ? ` · ${campaignCn(id)}` : "" }}</span>
            <NButton size="small" quaternary @click="menuFavoriteIds = menuFavoriteIds.filter((item) => item !== id)">移除</NButton>
          </div>
        </div>
      </FormField>

      <FormField label="搜索地图包">
        <NInput v-model:value="menuQuery" clearable placeholder="搜索地图包" />
      </FormField>
      <div class="menu-pool">
        <span v-for="campaign in menuPool" :key="campaign.id" class="menu-candidate">
          <b>{{ campaign.name }}{{ campaign.cnName ? ` · ${campaign.cnName}` : "" }}</b>
          <NButton size="small" quaternary :disabled="menuFixedIds.length >= CAMPAIGN_MENU_FIXED_SLOTS" @click="menuFixedIds = [...menuFixedIds, campaign.id]">加入固定区</NButton>
          <NButton size="small" quaternary :disabled="menuFavoriteIds.length >= CAMPAIGN_MENU_FAVORITE_SLOTS" @click="menuFavoriteIds = [...menuFavoriteIds, campaign.id]">加入收藏位</NButton>
        </span>
      </div>

      <template #footer>
        <div class="foot">
          <NButton quaternary @click="menuOpen = false">取消</NButton>
          <NButton type="primary" @click="saveMenu">保存菜单</NButton>
        </div>
      </template>
    </NModal>

    <!-- ── 资料编辑 ───────────────────────────────────────── -->
    <NModal
      :show="Boolean(campaignEditId)"
      preset="card"
      title="修改地图包资料"
      :bordered="false"
      style="max-width: 640px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) campaignEditId = null; }"
    >
      <div class="adm-form">
        <FormField label="英文名"><NInput v-model:value="campaignEdit.name" /></FormField>
        <FormField label="中文翻译"><NInput v-model:value="campaignEdit.cnName" /></FormField>
        <FormField label="中文别名" hint="逗号分隔"><NInput v-model:value="campaignEdit.aliases" /></FormField>
        <FormField label="发布地址" wide><NInput v-model:value="campaignEdit.publicationUrl" /></FormField>
        <AdminImageUpload v-model="campaignEdit.banner" v-model:preview="campaignEdit.bannerPreview" />
        <FormField label="注意事项" wide><NInput v-model:value="campaignEdit.notice" type="textarea" :rows="4" /></FormField>
      </div>
      <template #footer>
        <div class="foot">
          <NButton quaternary @click="campaignEditId = null">取消</NButton>
          <NButton
            type="primary"
            @click="campaignEditId && saveCatalogEdit('campaign', campaignEditId, catalogPatch(campaignEdit), '确认保存地图包信息修改？', () => campaignEditId = null)"
          >保存修改</NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="Boolean(mapEditId)"
      preset="card"
      title="修改地图资料"
      :bordered="false"
      style="max-width: 640px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) mapEditId = null; }"
    >
      <div class="adm-form">
        <FormField label="英文名"><NInput v-model:value="mapEdit.name" /></FormField>
        <FormField label="中文翻译"><NInput v-model:value="mapEdit.cnName" /></FormField>
        <FormField label="中文别名" hint="逗号分隔"><NInput v-model:value="mapEdit.aliases" /></FormField>
        <FormField label="Hist 等级" hint="地图级评级，该地图下所有挑战共用">
          <NSelect v-model:value="mapEdit.histRating" :options="histOptions" />
        </FormField>
        <AdminImageUpload v-model="mapEdit.banner" v-model:preview="mapEdit.bannerPreview" />
        <FormField label="注意事项" wide><NInput v-model:value="mapEdit.notice" type="textarea" :rows="4" /></FormField>
      </div>
      <template #footer>
        <div class="foot">
          <NButton quaternary @click="mapEditId = null">取消</NButton>
          <NButton
            type="primary"
            @click="mapEditId && saveCatalogEdit('map', mapEditId, catalogPatch(mapEdit), '确认保存地图资料修改？', () => mapEditId = null)"
          >保存修改</NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="Boolean(challengeEditId)"
      preset="card"
      title="修改挑战资料"
      :bordered="false"
      style="max-width: 560px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) challengeEditId = null; }"
    >
      <template #header-extra>
        <span class="subtitle">{{ challengeEditId ? challengeContext(challengeEditId).label : "" }}</span>
      </template>
      <div class="adm-form">
        <FormField label="挑战名称"><NInput v-model:value="challengeEdit.name" /></FormField>
        <FormField label="难度"><TierSelect v-model="challengeEdit.tier" /></FormField>
        <FormField label="注意事项" wide><NInput v-model:value="challengeEdit.notice" type="textarea" :rows="4" /></FormField>
      </div>
      <template #footer>
        <div class="foot">
          <NButton quaternary @click="challengeEditId = null">取消</NButton>
          <NButton
            type="primary"
            @click="challengeEditId && saveCatalogEdit('challenge', challengeEditId, challengeEdit, '确认保存挑战资料修改？', () => challengeEditId = null)"
          >保存修改</NButton>
        </div>
      </template>
    </NModal>

    <!-- ── 大厅编排 ───────────────────────────────────────── -->
    <NModal
      :show="Boolean(hallCampaign)"
      preset="card"
      title="调整大厅与地图顺序"
      :bordered="false"
      style="max-width: 900px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) hallCampaign = null; }"
    >
      <template #header-extra>
        <span class="subtitle">{{ hallCampaign ? campaignName(hallCampaign) : "" }} · 大厅和游离地图可混合拖动。</span>
      </template>

      <div v-if="hallCampaign" class="hall-create">
        <NInput v-model:value="hallDraft.name" placeholder="大厅英文名" aria-label="大厅英文名" />
        <NInput v-model:value="hallDraft.cnName" placeholder="大厅汉化" aria-label="大厅汉化" />
        <NInput v-model:value="hallDraft.aliases" placeholder="汉化别名，逗号分隔" aria-label="汉化别名" />
        <NColorPicker v-model:value="hallDraft.color" :modes="['hex']" :show-alpha="false" size="small" aria-label="大厅颜色" />
        <NButton @click="addHall(hallCampaign)">新建大厅</NButton>
      </div>

      <div
        v-if="hallCampaign"
        class="hall-sequence"
        @dragover.prevent
        @drop="dragToken && moveRootToken(hallCampaign, dragToken); dragToken = null"
      >
        <template v-for="token in rootTokens(hallCampaign)" :key="token">
          <article
            v-if="token.startsWith('map:')"
            class="loose-map"
            draggable="true"
            @dragstart="dragToken = token"
            @dragover.prevent
            @drop.stop="dragToken && moveRootToken(hallCampaign, dragToken, token); dragToken = null"
          >
            <b>游离地图</b>
            <span>{{ getCampaignMaps(hallCampaign).find((item) => item.id === Number(token.slice(4)))?.name || token.slice(4) }}</span>
          </article>

          <section
            v-else-if="getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))"
            class="hall-card"
            draggable="true"
            :style="{ '--hall-tone': getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.color }"
            @dragstart="dragToken = token"
            @dragover.prevent
            @drop.stop="
              dragToken?.startsWith('map:')
                ? putMapInHall(hallCampaign, Number(token.slice(5)), Number(dragToken.slice(4)))
                : dragToken && moveRootToken(hallCampaign, dragToken, token);
              dragToken = null
            "
          >
            <header class="hall-head">
              <NInput
                :value="getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.name"
                placeholder="大厅英文名"
                aria-label="大厅英文名"
                @blur="(event: FocusEvent) => updateHall(hallCampaign!, Number(token.slice(5)), { name: (event.target as HTMLInputElement).value })"
              />
              <NInput
                :value="getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.cnName || ''"
                placeholder="大厅汉化"
                aria-label="大厅汉化"
                @blur="(event: FocusEvent) => updateHall(hallCampaign!, Number(token.slice(5)), { cnName: (event.target as HTMLInputElement).value })"
              />
              <NInput
                :value="(getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.aliases || []).join('，')"
                placeholder="汉化别名"
                aria-label="汉化别名"
                @blur="(event: FocusEvent) => updateHall(hallCampaign!, Number(token.slice(5)), { aliases: splitAliases((event.target as HTMLInputElement).value) })"
              />
              <NColorPicker
                :value="getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.color"
                :modes="['hex']"
                :show-alpha="false"
                size="small"
                aria-label="大厅颜色"
                @update:value="(value: string) => updateHall(hallCampaign!, Number(token.slice(5)), { color: value })"
              />
              <NButton size="small" type="error" @click="deleteHall(hallCampaign, Number(token.slice(5)))">删除大厅</NButton>
            </header>
            <div class="hall-maps">
              <span
                v-for="mapId in getCampaignHalls(hallCampaign).find((item) => item.id === Number(token.slice(5)))!.mapIds || []"
                :key="mapId"
                class="hall-map"
                draggable="true"
                @dragstart.stop="dragToken = `map:${mapId}`"
                @dragover.prevent
                @drop.stop="
                  dragToken?.startsWith('map:') && reorderHallMap(hallCampaign!, Number(token.slice(5)), Number(dragToken.slice(4)), mapId);
                  dragToken = null
                "
              >{{ getCampaignMaps(hallCampaign).find((item) => item.id === mapId)?.name || mapId }}</span>
            </div>
            <small class="hall-hint">拖入地图；大厅内地图也可拖动排序</small>
          </section>
        </template>
      </div>

      <template #footer>
        <div class="foot"><NButton @click="hallCampaign = null">关闭</NButton></div>
      </template>
    </NModal>

    <!-- ── 分割 / 合并 ────────────────────────────────────── -->
    <NModal
      :show="Boolean(operation)"
      preset="card"
      :title="operation?.type === 'split' ? '分割挑战' : '合并挑战'"
      :bordered="false"
      style="max-width: 760px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) operation = null; }"
    >
      <template #header-extra>
        <span class="subtitle">{{ operation ? challengeContext(operation.challengeId).label : "" }}</span>
      </template>

      <template v-if="operation?.type === 'split'">
        <div class="split-grid">
          <FormField label="挑战一名称"><NInput v-model:value="operationDraft.first" /></FormField>
          <FormField label="挑战一难度"><TierSelect v-model="operationDraft.firstTier" /></FormField>
          <FormField label="挑战一注意事项" wide><NInput v-model:value="operationDraft.firstNotice" type="textarea" :rows="2" /></FormField>
          <FormField label="挑战二名称"><NInput v-model:value="operationDraft.second" /></FormField>
          <FormField label="挑战二难度"><TierSelect v-model="operationDraft.secondTier" /></FormField>
          <FormField label="挑战二注意事项" wide><NInput v-model:value="operationDraft.secondNotice" type="textarea" :rows="2" /></FormField>
        </div>
        <FormField label="选择分出的挑战记录">
          <div class="adm-pick-list">
            <label v-for="record in splitRecords" :key="record.id" class="adm-pick-row">
              <input
                type="checkbox"
                :checked="operationDraft.selected.includes(record.id)"
                @change="operationDraft.selected = operationDraft.selected.includes(record.id)
                  ? operationDraft.selected.filter((id) => id !== record.id)
                  : [...operationDraft.selected, record.id]"
              />
              <span>{{ playerNameOf(record.playerId) }} · {{ record.achievedAt || "未记录日期" }}</span>
              <small>{{ record.tags?.length ? `标签：${record.tags.join("、")}` : "无标签" }}</small>
            </label>
          </div>
        </FormField>
      </template>

      <template v-else>
        <div class="adm-form">
          <FormField label="合并到哪个挑战" wide>
            <NSelect v-model:value="operationDraft.targetId" :options="mergeTargets" filterable clearable placeholder="搜索目标挑战" />
          </FormField>
          <FormField label="给并入记录添加标签"><NInput v-model:value="operationDraft.label" /></FormField>
          <FormField label="标签颜色">
            <NColorPicker v-model:value="operationDraft.color" :modes="['hex']" :show-alpha="false" size="small" />
          </FormField>
        </div>
      </template>

      <template #footer>
        <div class="foot">
          <NButton quaternary @click="operation = null">取消</NButton>
          <NButton type="primary" @click="saveOperation">二次确认并保存</NButton>
        </div>
      </template>
    </NModal>

    <ChallengeGraphEditor v-if="graphMapId" :map-id="graphMapId" @close="graphMapId = null" />
  </div>
</template>

<style scoped>
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }

.map-nodes { display: grid; gap: var(--sp-2); padding: 0 var(--sp-3) var(--sp-3); }
.map-node { background: var(--bg-surface); border-radius: var(--r-sm); }
.entity-notice {
  margin: 0 var(--sp-3) var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--accent-500);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
}

/* 挑战行：名字与 Tier 固定槽位，动作区右对齐 —— 多行之间必须对齐成表。 */
.challenge-rows { display: grid; border-top: var(--hairline); }
.challenge-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) var(--slot-tier) auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: var(--hairline);
}
.challenge-row:last-child { border-bottom: 0; }
.challenge-identity { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); min-width: 0; }
.challenge-actions { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; justify-content: flex-end; }
.untiered { font-size: var(--fs-sm); color: var(--fg-subtle); }
.row-notice { grid-column: 1 / -1; font-size: var(--fs-sm); color: var(--fg-subtle); }

/* ── 顶部菜单编排 ───────────────────────────────────────── */
.menu-list { display: grid; gap: var(--sp-2); max-height: 260px; overflow-y: auto; overscroll-behavior: contain; }
.menu-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  cursor: grab;
}
/* 默认收藏位是「用户还没自己收藏时」的占位，虚线表示可被覆盖。 */
.menu-defaults .menu-row { border: 1px dashed var(--border-default); }
.menu-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-pool { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); max-height: 260px; overflow-y: auto; margin-top: var(--sp-3); }
.menu-candidate {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border-bottom: var(--hairline);
  font-size: var(--fs-sm);
}
.menu-candidate b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-normal); }

/* ── 大厅编排 ───────────────────────────────────────────── */
.hall-create { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 80px auto; gap: var(--sp-2); margin-bottom: var(--sp-4); }
.hall-sequence { display: grid; gap: var(--sp-3); }
.loose-map {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  cursor: grab;
}
.loose-map b { font-size: var(--fs-micro); font-weight: var(--fw-medium); color: var(--fg-subtle); }
.hall-card {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--bg-inset);
  /* 大厅色是管理员自选的标识色，只出现在这道脊上。 */
  border-left: 5px solid var(--hall-tone, var(--border-strong));
  border-radius: 0 var(--r-md) var(--r-md) 0;
  cursor: grab;
}
.hall-head { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 80px auto; gap: var(--sp-2); }
.hall-maps { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.hall-map {
  padding: var(--sp-1) var(--sp-2);
  background: var(--bg-surface);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  cursor: grab;
}
.hall-hint { font-size: var(--fs-micro); color: var(--fg-subtle); }

.split-grid { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: var(--sp-3); margin-bottom: var(--sp-4); }

@media (max-width: 900px) {
  .challenge-row,
  .hall-create,
  .hall-head,
  .split-grid,
  .menu-pool { grid-template-columns: 1fr; }
  .challenge-actions { justify-content: flex-start; }
}
</style>
