<script setup lang="ts">
/**
 * 玩家主页。
 *
 * 三块内容：身份与最难记录、炼金愿望单、挑战记录，外加一张按 Tier 分布的
 * 柱状图 —— 那张图是这一页真正的信息，一眼看出这个玩家停在哪个难度档上，
 * 所以它排在愿望单与记录之前。
 */
import { computed, ref, watch } from "vue";
import { NPopover, NRadioButton, NRadioGroup } from "naive-ui";
import { RouterLink } from "vue-router";
import AppPagination from "@/components/AppPagination.vue";
import { storeToRefs } from "pinia";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { formatDate } from "@shared/datetime";
import { challengeDisplayName } from "@shared/labels";
import { isRatedTier, isStandardTier, isTierCode, standardMeta, tierIndex, tierMeta, tierOrder } from "@shared/tiers";
import type { DifficultyCode, RatedTier, TierCode } from "@shared/types";
import { catalog, catalogReady, refreshCatalog } from "@/lib/catalog";
import { getPlayer } from "@/lib/selectors";
import { challengeContext, hiddenPlayerSubmissions, playerSubmissions } from "@/lib/projection";
import { overlayFor } from "@/lib/admin-overlay";
import { challengeHref } from "@/lib/routes";
import { announceAvatar } from "@/lib/avatar";
import { api } from "@/lib/api";
import { toast } from "@/lib/feedback";
import { fetchPlayerWishlist, type WishlistEntry } from "@/lib/wishlist";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LocalizedName from "@/components/LocalizedName.vue";
import LoadState from "@/components/LoadState.vue";
import MissingEntity from "@/components/MissingEntity.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import PlayerPresence from "@/components/PlayerPresence.vue";
import PlayerSubmissionQueue from "@/components/PlayerSubmissionQueue.vue";
import TierBadge from "@/components/TierBadge.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";
import RatioBar from "@/components/RatioBar.vue";
import LinkButton from "@/components/LinkButton.vue";
import AdminEntityTools from "@/components/AdminEntityTools.vue";

const props = defineProps<{ id: string }>();

const { t, locale, apiError } = useLanguage();
const { account, adminMode } = storeToRefs(useSessionStore());
const { compactTierLabels, tierColors, showStandardChallenges } = storeToRefs(useDisplayStore());

const playerId = computed(() => Number(props.id));
const player = computed(() => getPlayer(playerId.value));
const isOwner = computed(() => account.value?.claimedPlayerId === playerId.value);
const missing = computed(() => catalogReady.value && !player.value);

type RecordView = {
  id: number; challengeId: number; tier: DifficultyCode | null;
  title: string; cnTitle?: string; subtitle: string; mapId?: number;
  achievedAt: string; hidden?: boolean;
};

const overlay = computed(() => overlayFor(adminMode.value));

/** 管理态才叠后台覆盖层；公开视角只认目录，也不会去打后台接口。 */
const displayRecords = computed<RecordView[]>(() => {
  if (!catalogReady.value) return [];
  const publicItems = playerSubmissions(playerId.value, overlay.value);
  const hiddenItems = adminMode.value ? hiddenPlayerSubmissions(playerId.value, overlay.value) : [];
  return [...publicItems, ...hiddenItems].map((item) => {
    const context = challengeContext(item.challengeId);
    return {
      id: item.id,
      challengeId: item.challengeId,
      tier: context.challenge?.tier || context.multiChallenge?.tier || null,
      title: context.map?.name || context.campaign?.name || t("common.multiChallenge"),
      cnTitle: context.map ? context.map.cnName : context.campaign?.cnName,
      subtitle: context.challenge ? challengeDisplayName(context.challenge) : context.multiChallenge?.name || t("challenge.kicker"),
      mapId: context.map?.id,
      achievedAt: item.achievedAt,
      hidden: item.status === "hidden",
    };
  });
});

const byDifficulty = (a: RecordView, b: RecordView) =>
  tierIndex(a.tier as DifficultyCode) - tierIndex(b.tier as DifficultyCode)
  || a.title.localeCompare(b.title)
  || a.subtitle.localeCompare(b.subtitle);

/** 个人总数与「最难」只统计正式档位的公开记录。 */
const publicOrdered = computed(() => displayRecords.value
  .filter((item): item is RecordView & { tier: TierCode } => isTierCode(item.tier) && !item.hidden)
  .sort(byDifficulty));

const visibleRecords = computed(() => displayRecords.value
  .filter((item): item is RecordView & { tier: RatedTier } =>
    isRatedTier(item.tier) && (showStandardChallenges.value || isTierCode(item.tier)))
  .sort(byDifficulty));

const chartBars = computed(() => {
  const bars = tierOrder.map((tier) => ({
    key: tier as string,
    label: tierMeta[tier].label,
    group: tierMeta[tier].group,
    color: tierColors.value[tier],
    count: publicOrdered.value.filter((record) => record.tier === tier).length,
  }));
  if (showStandardChallenges.value) {
    bars.push({
      key: "std", label: "Std", group: "Std",
      color: standardMeta["mid-std"].color,
      count: displayRecords.value.filter((record) => isStandardTier(record.tier) && !record.hidden).length,
    });
  }
  return bars;
});
const maxCount = computed(() => Math.max(1, ...chartBars.value.map((bar) => bar.count)));
const hardest = computed(() => publicOrdered.value[0]);

const PAGE_SIZE = 10;
const page = ref(1);
watch([showStandardChallenges, playerId], () => { page.value = 1; });
const pageRows = computed(() => visibleRecords.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

/* 17 根柱子按 tierMeta.group 归为 9 组：T-1 与 T4–T7 各一根，
   T0–T3 各三根（High / Mid / Low）。开启 Standard 时在末尾增加一列汇总。 */
const tierGroupSpans = computed(() => {
  const out: Array<{ label: string; span: number }> = [];
  for (const bar of chartBars.value) {
    const label = bar.group;
    const last = out[out.length - 1];
    if (last && last.label === label) last.span += 1;
    else out.push({ label, span: 1 });
  }
  return out;
});

const chartDescription = computed(() => chartBars.value
  .map((bar) => t("player.chartItem", { tier: bar.label, count: bar.count }))
  .join(locale.value === "en" ? ", " : "，"));

const wishlist = ref<WishlistEntry[]>([]);
watch(playerId, async (id) => { wishlist.value = await fetchPlayerWishlist(id); }, { immediate: true });

const wishViews = computed(() => wishlist.value.map((item) => ({ item, context: challengeContext(item.challengeId) })));
const activeWishes = computed(() => wishViews.value.filter(({ item }) => item.status !== "archive"));
const archivedWishes = computed(() => wishViews.value.filter(({ item }) => item.status === "archive"));

const wishlistHref = computed(() => `/wishlist?playerId=${playerId.value}`);
const wishHref = (item: WishlistEntry) => `${wishlistHref.value}&challengeId=${item.challengeId}`;

const uids = computed(() => (player.value ? playerBilibiliUids(player.value) : []));

const avatarBusy = ref(false);
const avatarMessage = ref("");
async function refreshAvatar() {
  avatarBusy.value = true;
  avatarMessage.value = "";
  const { ok, data } = await api.post<{ url?: string | null }>(`/api/players/${playerId.value}/avatar`, {});
  avatarBusy.value = false;
  if (!ok) { avatarMessage.value = apiError(data, "player.avatarFailed"); return; }
  announceAvatar(playerId.value, data.url ?? null);
  avatarMessage.value = t("player.avatarRefreshed");
  toast.success(t("player.avatarRefreshed"));
}

const statusBusy = ref(false);
const statusHelpOpen = ref(false);
const statusHelpTrigger = ref<HTMLButtonElement | null>(null);

/* 面板自己的 clickoutside 挂在 document 的捕获阶段，比按钮的 click 先跑；
   不放过按钮本身的话，再点一次只会「先关后开」，等于关不掉。 */
function closeStatusHelp(event: MouseEvent) {
  if (statusHelpTrigger.value?.contains(event.target as Node)) return;
  statusHelpOpen.value = false;
}

async function setPlayerStatus(status: "normal" | "unwilling") {
  statusBusy.value = true;
  try {
    const { ok, data } = await api.patch(`/api/players/${playerId.value}/status`, { status });
    if (!ok) { toast.error(apiError(data, "player.statusFailed")); return; }
    await refreshCatalog();
    toast.success(t("player.statusSaved"));
  } finally { statusBusy.value = false; }
}

const term = computed(() => (compactTierLabels.value ? "T" : "Tier"));
const recordHref = (record: RecordView) => `/record/${record.id}`;
const challengeLink = (record: RecordView) => {
  const context = challengeContext(record.challengeId);
  return context.challenge ? challengeHref(record.challengeId, context.challenge.mapId) : `/multi-challenge/${record.challengeId}`;
};
</script>

<template>
  <PageShell v-if="!catalogReady">
    <LoadState variant="page" />
  </PageShell>
  <MissingEntity v-else-if="missing" label="entity.missingChallenge" />
  <PageShell v-else-if="player">
    <header class="hero">
      <PlayerAvatar :player-id="player.id" :name="player.name" class="hero-avatar" />
      <div class="identity">
        <p class="kicker">{{ t("common.players") }}</p>
        <h1 class="player-name">{{ player.name }}</h1>
        <p class="bio">{{ player.bio || (player.bilibiliUid ? `Bilibili UID ${player.bilibiliUid}` : t("player.defaultBio")) }}</p>
        <div class="profile-links">
          <a v-for="uid in uids" :key="uid" class="link" :href="`https://space.bilibili.com/${uid}`" target="_blank" rel="noreferrer">
            {{ t("player.bilibili") }}{{ uids.length > 1 ? ` · ${uid}` : "" }}
          </a>
          <template v-if="isOwner && uids.length">
            <button type="button" class="link" :disabled="avatarBusy" @click="refreshAvatar">{{ t("player.refreshAvatar") }}</button>
            <span class="avatar-note" role="status">{{ avatarMessage || t("player.avatarCache") }}</span>
          </template>
        </div>
      </div>
      <dl class="numbers">
        <div>
          <dt>{{ t("player.recordCount") }}</dt>
          <dd>{{ publicOrdered.length }}</dd>
        </div>
        <div>
          <dt>{{ t("player.hardest") }}</dt>
          <dd class="hardest"><TierBadge v-if="hardest" :tier="hardest.tier" /><template v-else>—</template></dd>
        </div>
      </dl>
      <!-- 上榜意愿是「关于这个档案的设置」，不是档案内容：细线以下自成一行，
           两端对齐读作一条设置行，而不是塞在数字旁边的一个控件。 -->
      <div v-if="isOwner" class="status-bar">
        <span class="status-label">{{ t("player.statusLabel") }}</span>
        <span v-if="player.status === 'blocked'" class="status-restricted" :title="t('error.playerBlocked')">{{ t("player.statusBlocked") }}</span>
        <div v-else class="status-choice">
          <NRadioGroup :value="player.status" size="small" :disabled="statusBusy" :aria-label="t('player.statusLabel')" @update:value="setPlayerStatus">
            <NRadioButton value="normal">{{ t("player.statusNormal") }}</NRadioButton>
            <NRadioButton value="unwilling">{{ t("player.statusUnwilling") }}</NRadioButton>
          </NRadioGroup>
          <!-- trigger 只能二选一，而点击与悬停都要能开：hover 负责鼠标，
               点击自己接管，on-clickoutside 让触摸设备也关得掉。 -->
          <NPopover
            v-model:show="statusHelpOpen"
            trigger="hover"
            placement="bottom-end"
            :style="{ maxWidth: 'min(300px, calc(100vw - 32px))' }"
            :on-clickoutside="closeStatusHelp"
          >
            <template #trigger>
              <button
                ref="statusHelpTrigger"
                type="button"
                class="help"
                :aria-label="t('player.statusHelp')"
                :aria-expanded="statusHelpOpen"
                @click="statusHelpOpen = !statusHelpOpen"
                @keydown.esc="statusHelpOpen = false"
              >?</button>
            </template>
            <div class="status-help">
              <p class="status-help-title">{{ t("player.statusHelpTitle") }}</p>
              <ul>
                <li>{{ t("player.statusHelpNew") }}</li>
                <li>{{ t("player.statusHelpExisting") }}</li>
                <li>{{ t("player.statusHelpRevert") }}</li>
              </ul>
            </div>
          </NPopover>
        </div>
      </div>
    </header>

    <AdminEntityTools kind="player" :id="player.id" :label="player.name" />

    <PlayerPresence :player-id="player.id" :is-owner="isOwner" />

    <!-- 审核中与已拒绝的提交只对本人显示，其它访客连接口都不会打。 -->
    <PlayerSubmissionQueue v-if="isOwner" />

    <PanelBlock :title="t('player.chart')">
      <div class="chart" :style="{ gridTemplateColumns: `repeat(${chartBars.length}, minmax(0, 1fr))` }" role="img" :aria-label="chartDescription">
        <!-- 第一行：数量 -->
        <span v-for="bar in chartBars" :key="`n-${bar.key}`" class="count" :data-zero="bar.count === 0 || undefined">
          {{ bar.count }}
        </span>
        <!-- 第二行：等长槽位。柱子长度一致，值由内部填充高度表达 ——
             零值档只剩一片空白的话，整排柱子读起来会参差不齐。 -->
        <div v-for="bar in chartBars" :key="`t-${bar.key}`" class="track">
          <i :style="{ height: bar.count ? `${Math.max(6, bar.count / maxCount * 100)}%` : '0', background: bar.color }" />
        </div>
        <!-- 第三行：档位名，横跨该组的若干列居中。这里一律用简写，不跟随
             显示设置里的 Tier / T 开关：多个标签横排，"Tier 0" 必然互相挤压，
             而且这一排难度柱的上下文已经足够说明它是什么。 -->
        <span
          v-for="group in tierGroupSpans"
          :key="group.label"
          class="group-label"
          :data-span="group.span > 1 ? 'multi' : undefined"
          :style="{ gridColumn: `span ${group.span}` }"
        >{{ group.label.replace(/Tier\s*/, "T") }}</span>
      </div>
    </PanelBlock>

    <PanelBlock
      v-if="activeWishes.length || archivedWishes.length || isOwner"
      :title="t('player.wishlist')"
      :subtitle="activeWishes.length ? t('player.wishlistActive', { count: activeWishes.length }) : t('player.wishlistEmpty')"
    >
      <template #actions>
        <LinkButton :to="wishlistHref" size="small">{{ t("player.viewWishlist") }}</LinkButton>
      </template>

      <ul v-if="activeWishes.length" class="wishes">
        <li v-for="{ item, context } in activeWishes" :key="item.id">
          <RouterLink :to="wishHref(item)" class="wish">
            <div class="wish-top">
              <strong>{{ context.map?.name || context.campaign?.name }}</strong>
              <HistRatingBadge v-if="context.map && context.challenge" :map-id="context.map.id" />
              <TierBadge v-if="context.challenge?.tier" :tier="context.challenge.tier" size="sm" />
            </div>
            <span class="wish-challenge">{{ context.challenge?.name || context.multiChallenge?.name }}</span>
            <RatioBar
              size="sm"
              :segments="[
                { value: item.progress, color: 'var(--accent-500)', label: t('player.progress') },
                { value: 100 - item.progress, color: 'transparent', label: t('player.remaining') },
              ]"
            />
            <div class="wish-foot">
              <b>{{ item.progress }}%</b>
              <span v-if="item.bestDeaths != null">{{ t("player.bestDeaths", { count: item.bestDeaths }) }}</span>
              <span v-if="item.practiceDuration">{{ t("player.practice", { duration: item.practiceDuration }) }}</span>
            </div>
            <p v-if="item.comment" class="wish-note">{{ item.comment }}</p>
          </RouterLink>
        </li>
      </ul>

      <details v-if="archivedWishes.length" class="archive">
        <summary>{{ t("player.archive", { count: archivedWishes.length }) }}</summary>
        <ul>
          <!-- 多地图挑战没有 map/challenge，只有 campaign/multiChallenge，
               两边都要兜底，否则这一行整条是空的、看着像条目丢了。 -->
          <li v-for="{ item, context } in archivedWishes" :key="item.id">
            <RouterLink :to="wishHref(item)">
              {{ context.map?.name || context.campaign?.name }}
              <span>{{ context.challenge?.name || context.multiChallenge?.name }}</span>
            </RouterLink>
          </li>
        </ul>
      </details>
    </PanelBlock>

    <PanelBlock :title="t('player.recordCount')" :subtitle="t('player.recordsCount', { count: visibleRecords.filter((item) => !item.hidden).length })">
      <p v-if="!pageRows.length" class="empty">{{ t("player.noRecords", { term }) }}</p>
      <ul v-else class="records">
        <li v-for="record in pageRows" :key="record.id">
          <RouterLink :to="recordHref(record)" class="record" :data-hidden="record.hidden || undefined">
            <span class="record-main">
              <LocalizedName :name="record.title" :cn-name="record.cnTitle" inline truncate />
              <em class="record-challenge">{{ record.subtitle }}</em>
              <em v-if="record.hidden" class="hidden-tag">Hidden</em>
            </span>
            <span class="record-date">{{ formatDate(record.achievedAt, locale) }}</span>
            <span class="record-ratings">
              <HistRatingBadge v-if="record.mapId" :map-id="record.mapId" />
              <TierBadge :tier="record.tier" size="sm" />
            </span>
          </RouterLink>
        </li>
      </ul>

      <AppPagination
        v-if="visibleRecords.length > PAGE_SIZE"
        v-model:page="page"
        class="pager"
        :page-size="PAGE_SIZE"
        :item-count="visibleRecords.length"
        size="small"
      />
    </PanelBlock>
  </PageShell>
</template>

<style scoped>
/* ── 身份 ─────────────────────────────────────────────────── */
/* 一行身份 + 一条细线以下的「数据与设置」。桌面上数字还塞得进身份行的右侧，
   手机上塞不进，就整条落到细线下面 —— 两种宽度共用同一套栅格位。 */
.hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--sp-5);
  row-gap: var(--sp-4);
}
.hero-avatar {
  grid-area: 1 / 1;
  --avatar-size: 64px;
  border: var(--hairline);
  background: var(--bg-raised);
  font-family: var(--font-title);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  color: var(--fg-muted);
}
.identity { grid-area: 1 / 2; display: grid; gap: var(--sp-1); min-width: 0; }
.kicker {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}
.player-name {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.02em;
  color: var(--fg-default);
  overflow-wrap: anywhere;
}
.bio { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
.profile-links { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); }
.link {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: var(--fs-sm);
  line-height: inherit;
  color: var(--link);
  cursor: pointer;
}
.link:disabled { opacity: .6; cursor: wait; }
.avatar-note { font-size: var(--fs-sm); color: var(--fg-subtle); }

.status-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-3);
  padding-top: var(--sp-3);
  border-top: var(--hairline);
}
.status-label { font-size: var(--fs-sm); color: var(--fg-muted); }
.status-choice { display: flex; align-items: center; gap: var(--sp-2); }
.status-restricted { font-size: var(--fs-sm); color: var(--fg-muted); }

/* 圆圈问号。16px 的圆放在分段开关边上刚好不抢戏，
   ::after 把可点区域撑到 32px，手指按得中。 */
.help {
  position: relative;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  /* 描边与字同属一个灰阶：亮色主题下 --border-* 落在 #bcc0c6 这一档，
     1px 的圈在白底上会淡到看不见。 */
  border: 1px solid var(--fg-disabled);
  border-radius: 50%;
  background: none;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  line-height: 1;
  color: var(--fg-muted);
  cursor: pointer;
}
.help::after { content: ""; position: absolute; inset: -8px; }
.help[aria-expanded="true"] { border-color: var(--fg-default); color: var(--fg-default); }
@media (hover: hover) {
  .help:hover { border-color: var(--fg-default); color: var(--fg-default); }
}

.status-help { display: grid; gap: var(--sp-2); font-size: var(--fs-sm); line-height: var(--lh-body); }
.status-help-title { margin: 0; font-weight: var(--fw-medium); color: var(--fg-default); }
.status-help ul { margin: 0; padding-left: 1.1em; color: var(--fg-secondary); }
.status-help li + li { margin-top: var(--sp-1); }

.numbers { grid-area: 1 / 3; display: flex; gap: var(--sp-5); margin: 0; flex: 0 0 auto; }
.numbers > div { display: grid; gap: 2px; justify-items: end; }
.numbers dt { font-size: var(--fs-micro); color: var(--fg-subtle); order: 2; }
.numbers dd {
  margin: 0;
  order: 1;
  /* 数值与 Tier 徽章共用同一条行高。徽章是 28px 的定高胶囊，纯数字的行盒
     只有字号那么高 —— 不钉死这一档，有徽章的那一格就会把名称推低几个像素，
     两格的名称对不上一条线。 */
  display: flex;
  align-items: center;
  min-height: 28px;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: 1;
  color: var(--fg-default);
}

/* ── 炼金数据（柱状图）─────────────────────────────────────
   三行网格：数量 / 槽位 / 档位名。所有槽位等宽等长，值由内部填充高度
   表达 —— 零值档整格空白会让一排柱子看起来长短不一，实际上那是「没有」
   而不是「短」。 */
.chart {
  display: grid;
  grid-template-rows: auto 140px auto;
  gap: var(--sp-2) 3px;
  align-items: end;
}
.count {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  text-align: center;
  color: var(--fg-secondary);
}
/* 零值压到最弱，避免十七个 0 抢走注意力 */
.count[data-zero] { color: var(--fg-disabled); }

.track {
  display: flex;
  align-items: flex-end;
  height: 100%;
  /* 槽位本身必须看得见，否则零值档就成了一段空白 */
  background: var(--bg-raised);
  border-radius: 2px;
  overflow: hidden;
}
.track > i { display: block; width: 100%; border-radius: 2px 2px 0 0; }

/* 跨多列时画成 ⌊—— T1 ——⌋：两端的竖线标出这一段到哪里为止，
   否则「T1」居中悬在三根柱子上方，读者仍要自己数它管几根。 */
.group-label {
  grid-row: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
  white-space: nowrap;
}
.group-label[data-span]::before,
.group-label[data-span]::after {
  content: "";
  flex: 1 1 auto;
  min-width: 4px;
  height: 5px;
  border-bottom: 1px solid var(--border-default);
}
.group-label[data-span]::before { border-left: 1px solid var(--border-default); }
.group-label[data-span]::after { border-right: 1px solid var(--border-default); }

/* ── 愿望单 ──────────────────────────────────────────────── */
.wishes { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-3); }
.wish {
  display: grid;
  gap: var(--sp-2);
  height: 100%;
  align-content: start;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-inset);
  border-radius: var(--r-md);
  color: var(--fg-secondary);
  transition: background-color var(--dur-fast) var(--ease);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .wish:hover { background: var(--bg-raised); }
}
/* 颜色钉在 @media 外：触摸设备不匹配 (hover: hover)，
   否则手指按下去时全局的 a:hover 会把文字变成链接蓝。 */
.wish:hover,
.wish:active,
.wish:focus { color: var(--fg-secondary); }
.wish:active { background: var(--bg-raised); }
.wish-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.wish-top strong { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: anywhere; }
.wish-challenge { font-size: var(--fs-micro); color: var(--fg-subtle); }
.wish-foot { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; font-size: var(--fs-micro); color: var(--fg-subtle); }
.wish-foot b { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-size: var(--fs-sm); color: var(--fg-default); }
.wish-note {
  margin: 0;
  font-size: var(--fs-micro);
  line-height: var(--lh-snug);
  color: var(--fg-subtle);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.archive { margin-top: var(--sp-4); }
.archive summary { font-size: var(--fs-sm); color: var(--fg-muted); cursor: pointer; padding: var(--sp-2) 0; }
.archive ul { margin: 0; padding: 0 0 0 var(--sp-4); list-style: none; display: grid; gap: var(--sp-2); }
.archive a { font-size: var(--fs-sm); color: var(--fg-secondary); }
.archive a span { color: var(--fg-subtle); }

/* ── 挑战记录 ─────────────────────────────────────────────── */
.records { margin: 0; padding: 0; list-style: none; display: grid; border-top: var(--hairline); }
.record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-1);
  border-bottom: var(--hairline);
  color: var(--fg-secondary);
  transition: background-color var(--dur-fast) var(--ease);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .record:hover { background: var(--bg-raised); }
}
.record:hover,
.record:active,
.record:focus { color: var(--fg-secondary); }
.record:active { background: var(--bg-raised); }
.record[data-hidden] { opacity: .55; }
.record-main { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
.record-challenge { font-style: normal; font-size: var(--fs-sm); color: var(--fg-muted); white-space: nowrap; }
.hidden-tag {
  font-style: normal;
  font-size: var(--fs-micro);
  padding: 1px var(--sp-2);
  border: 1px solid var(--accent-400);
  border-radius: var(--r-sm);
  color: var(--accent-400);
}
.record-date {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
  text-align: right;
}
.record-ratings { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: var(--sp-2); }

.pager { margin-top: var(--sp-4); }
.empty { margin: 0; padding: var(--sp-6) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .hero { grid-template-columns: auto minmax(0, 1fr); column-gap: var(--sp-4); row-gap: var(--sp-3); }
  .hero-avatar { --avatar-size: 52px; }
  /* 数字落到细线以下，与设置行合成一块。数值与名称并排而不是上下叠，
     两对加起来才占得下 360px 宽屏幕的一行。 */
  .numbers {
    grid-area: 2 / 1 / 3 / -1;
    justify-content: flex-start;
    padding-top: var(--sp-3);
    border-top: var(--hairline);
  }
  /* 并排时不能用基线对齐：徽章的基线是它内部文字的基线，胶囊的上下内边距
     会整块吊在行外。定高的行盒改用居中，数值格与徽章格才落在同一条线上。 */
  .numbers > div { display: flex; align-items: center; gap: var(--sp-2); }
  .numbers dd { font-size: var(--fs-h3); }
  /* 细线只画一条：数字与设置同属细线以下的那一块。 */
  .status-bar { padding-top: 0; border-top: 0; }
  .chart { grid-template-rows: auto 96px auto; gap: var(--sp-1) 2px; }
  /* 手机上 9 个标签横排必然重叠，缩到 9px 才排得下 */
  .group-label { font-size: 9px; }
  .record { grid-template-columns: minmax(0, 1fr) auto; }
  .record-date { display: none; }
}
</style>
