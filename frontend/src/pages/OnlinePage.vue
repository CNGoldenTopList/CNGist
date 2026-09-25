<script setup lang="ts">
/**
 * 在线玩家看板 —— 全站唯一的实时列表。
 *
 * 每个格子都是同一个两行栅格（22px 主行 / 18px 副行）：四列的第一行彼此
 * 对齐、第二行彼此对齐，与格内有没有头像、有没有副行无关。头像跨两行。
 *
 * 焦点只留一个：金色的「带金中」。它挂在玩家名后面，于是金色标记聚在列表
 * 顶部，是全行唯一的非 Tier 饱和色。
 */
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { challengeDisplayName } from "@shared/labels";
import { isRatedTier, ratedTierColor } from "@shared/tiers";
import type { DifficultyCode } from "@shared/types";
import { api } from "@/lib/api";
import { challengeHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";
import { useDisplayStore, type TierColorMap } from "@/stores/display";
import PageShell from "@/components/PageShell.vue";
import LoadState from "@/components/LoadState.vue";
import LocalizedName from "@/components/LocalizedName.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import TierBadge from "@/components/TierBadge.vue";
import RatioBar from "@/components/RatioBar.vue";
import I18nMessage from "@/components/I18nMessage.vue";

type OnlinePlayer = {
  playerId: number; playerName: string;
  mapId?: number | null; mapName?: string | null; mapCnName?: string | null;
  campaignId?: number | null; campaignName?: string | null; campaignCnName?: string | null;
  challengeId?: number | null; challengeName?: string | null; tier?: DifficultyCode | null;
  activity?: string; source?: string; wishlistProgress?: number | null;
  position?: number | null; routeLength?: number | null; room?: string;
  holdingGolden?: boolean | null; liveUrl?: string | null;
};

const { t } = useLanguage();
const { tierColors } = storeToRefs(useDisplayStore());

const players = ref<OnlinePlayer[] | null>(null);
const failed = ref(false);
let pending = false;

async function load() {
  if (document.visibilityState !== "visible" || pending) return;
  pending = true;
  const { ok, data } = await api.get<{ players: OnlinePlayer[] }>("/api/online");
  if (ok) { players.value = data.players; failed.value = false; } else { players.value = null; failed.value = true; }
  pending = false;
}

void load();
const timer = window.setInterval(() => void load(), 10_000);
document.addEventListener("visibilitychange", load);
onUnmounted(() => {
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", load);
});

/** 行的左侧色脊取推测挑战的难度色；无难度或非难度状态时退回中性描边。 */
const railColor = (tier: OnlinePlayer["tier"], colors: TierColorMap) =>
  (isRatedTier(tier) ? ratedTierColor(tier, colors) : undefined);

const progressSegments = (player: OnlinePlayer) => [
  { value: player.position ?? 0, color: "var(--fg-subtle)", label: t("online.progress") },
  { value: (player.routeLength ?? 0) - (player.position ?? 0), color: "var(--border-subtle)", label: t("online.routeLeft") },
];

const count = computed(() => players.value?.length ?? 0);
</script>

<template>
  <PageShell :title="t('online.title')" width="wide">
    <template #lede>
      <I18nMessage id="online.lede">
        <template #link><RouterLink to="/tracker/install">CNGoldenLink</RouterLink></template>
      </I18nMessage>
    </template>

    <div>
      <div class="toolbar">
        <span class="count">
          <template v-if="players">{{ t("online.count", { count }) }}</template>
          <template v-else>{{ t("nav.online") }}</template>
        </span>
        <!-- 全站唯一一处非交互动效：一颗表示「这一页是活的」的呼吸点。 -->
        <span class="refresh"><i class="pulse" aria-hidden="true" />{{ t("online.refresh") }}</span>
      </div>

      <p v-if="failed" role="alert" class="empty">{{ t("player.statusUnavailable") }}</p>
      <LoadState v-else-if="!players" />
      <p v-else-if="!players.length" class="empty">{{ t("online.empty") }}</p>
      <div v-else class="board" role="table" :aria-label="t('online.title')">
        <div class="head" role="row">
          <span role="columnheader">{{ t("online.player") }}</span>
          <span role="columnheader">{{ t("online.map") }}</span>
          <span role="columnheader">{{ t("online.challenge") }}</span>
          <span role="columnheader">{{ t("online.progress") }}</span>
        </div>

        <div
          v-for="player in players"
          :key="player.playerId"
          class="row"
          role="row"
          :style="{ '--row-rail': railColor(player.tier, tierColors) }"
        >
          <!-- 玩家 —— 头像跨两行，带金标记跟着名字走 -->
          <div class="cell player" role="cell">
            <PlayerAvatar :player-id="player.playerId" :name="player.playerName" class="row-avatar" />
            <div class="main">
              <RouterLink class="name" :to="`/player/${player.playerId}`">{{ player.playerName }}</RouterLink>
              <span v-if="player.holdingGolden === true" class="golden">{{ t("tracker.live.holdingGolden") }}</span>
            </div>
            <div class="sub">
              <a v-if="player.liveUrl" class="live" :href="player.liveUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('online.liveLabel', { name: player.playerName })">
                {{ t("online.live") }} ↗
              </a>
              <span v-if="player.holdingGolden === null">{{ t("online.goldenUnknown") }}</span>
            </div>
          </div>

          <!-- 地图 / 地图包 —— 双语名横排截断，与全站其它密集列表一致 -->
          <div class="cell map" role="cell">
            <div class="main">
              <RouterLink v-if="player.mapId" :to="`/map/${player.mapId}`">
                <LocalizedName :name="player.mapName!" :cn-name="player.mapCnName ?? undefined" inline truncate />
              </RouterLink>
              <span v-else class="truncate muted">{{ player.mapName ?? t("wishlist.liveMenu") }}</span>
            </div>
            <div class="sub">
              <RouterLink v-if="player.mapId && player.campaignId" class="campaign" :to="`/campaign/${player.campaignId}`">
                <LocalizedName :name="player.campaignName!" :cn-name="player.campaignCnName ?? undefined" inline truncate />
              </RouterLink>
              <span v-else-if="player.mapName">{{ t("online.unmatched") }}</span>
            </div>
          </div>

          <!-- 推测挑战 —— 难度徽章是这一格的身份 -->
          <div class="cell challenge" role="cell">
            <div class="main">
              <span v-if="player.activity === 'clearing'" class="muted">{{ t("online.clearing") }}</span>
              <template v-else-if="player.challengeId && player.mapId">
                <TierBadge v-if="player.tier" :tier="player.tier" size="sm" />
                <RouterLink class="challenge-name" :to="challengeHref(player.challengeId, player.mapId)">
                  {{ challengeDisplayName({ name: player.challengeName! }) }}
                </RouterLink>
              </template>
              <span v-else class="muted">—</span>
            </div>
            <div class="sub">
              <span v-if="player.challengeId" class="truncate">
                <template v-if="player.source === 'selection'">{{ t("online.fromSelection") }}</template>
                <template v-else-if="player.source === 'wishlist'">
                  {{ player.wishlistProgress != null ? t("online.fromWishlistProgress", { percent: player.wishlistProgress }) : t("online.fromWishlist") }}
                </template>
                <template v-else>{{ t("online.fromClear") }}</template>
              </span>
            </div>
          </div>

          <!-- 实时路线进度 —— 数字右对齐成一列，条只给量感 -->
          <div class="cell progress" role="cell">
            <div class="main">
              <div v-if="player.position != null && player.routeLength" class="gauge">
                <span class="gauge-text">{{ t("tracker.live.position", { index: player.position, total: player.routeLength }) }}</span>
                <RatioBar size="sm" :segments="progressSegments(player)" />
              </div>
              <span v-else class="muted">{{ t("online.unknown") }}</span>
            </div>
            <div class="sub"><span class="room">{{ player.room }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
/* ── 工具条 ───────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-bottom: var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--fg-subtle);
}
.count { color: var(--fg-secondary); }
.refresh { display: inline-flex; align-items: center; gap: var(--sp-2); }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--ok-400); animation: pulse 2.4s var(--ease) infinite; }
@keyframes pulse { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }

/* ── 看板：分区手段是地面色差 + 细线 + 留白，没有外壳。 ── */
.board { display: grid; }

.head,
.row {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr) 212px 196px;
  gap: var(--sp-5);
  align-items: center;
  padding: var(--sp-3) var(--sp-4);
  /* 表头补一条透明色脊，标题才和下面的行左对齐 */
  border-left: var(--rail-w) solid transparent;
}

.head {
  padding-block: 0 var(--sp-2);
  border-bottom: var(--hairline);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--fg-subtle);
}

.row {
  /* 色脊取该行推测挑战的 Tier 色。列表按带金、按难度排序，几十行铺下来，
     色脊连起来就是当前在线的难度分布。 */
  border-left-color: var(--row-rail, var(--border-strong));
  border-bottom: var(--hairline);
  transition: background-color var(--dur-fast) var(--ease);
}
.row:last-child { border-bottom: 0; }
@media (hover: hover) {
  .row:hover { background: var(--bg-surface); }
}

/* ── 格子：两行栅格，全表共用同一条基线 ────────────────────── */
.cell { display: grid; grid-template-rows: 22px 18px; align-items: center; min-width: 0; }
.main { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; font-size: var(--fs-body); line-height: 1.35; color: var(--fg-secondary); }
.sub {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--fs-micro);
  line-height: 1.35;
  /* 副行统一 --fg-muted 而不是更弱的 --fg-subtle：双语名的中文部分只取
     父级颜色的 68%，再弱一档 11px 的中文名就掉到 3.3:1 了。 */
  color: var(--fg-muted);
}
.truncate,
.main > a,
.sub > a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── 玩家 ─────────────────────────────────────────────────── */
.player { grid-template-columns: 32px minmax(0, 1fr); column-gap: var(--sp-3); }
.row-avatar { --avatar-size: 32px; grid-row: 1 / 3; align-self: center; background: var(--bg-raised); color: var(--fg-muted); }

/* 名字是行的锚点，不给链接蓝：一行里蓝色只留给地图名和直播 */
.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-medium); color: var(--fg-default); }
.name:hover { color: var(--link-hover); text-decoration: underline; }

/* 带金标记 —— 全行唯一的非 Tier 饱和色。不做成胶囊：同一行右侧就是
   Tier 徽章，两个胶囊并置会互相说「我是难度」。 */
.golden {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  color: var(--brand-mark);
}
.golden::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.live { color: var(--link); }
.live:hover { text-decoration: underline; }

/* ── 地图 / 地图包：双语名一律横排截断，竖排会让这一格比别的格子高两行。 ── */
.map > .main > a { color: var(--link); }
.map > .main > a:hover { text-decoration: underline; }
.campaign { color: inherit; }
.campaign:hover { color: var(--link); text-decoration: underline; }

/* ── 推测挑战：难度徽章是这一格的身份，挑战名跟着走正文色 ── */
.challenge-name { color: var(--fg-secondary); }
.challenge-name:hover { color: var(--link); text-decoration: underline; }

/* ── 路线进度：位置数字在前、条在后。这一列真正要读的是「第几个房间」，
     条只是它的量感。 ── */
.gauge { flex: 1 1 auto; display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
/* 条不铺满整列：一行的最右侧若是一条长灰轨，它会比金色更抢眼。 */
.gauge > :last-child { flex: 0 1 96px; min-width: 40px; }
.gauge-text {
  flex: 0 0 auto;
  text-align: right;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-sm);
  color: var(--fg-default);
}
.room { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-num); color: var(--fg-subtle); }

.muted { color: var(--fg-subtle); }
.empty { padding-block: var(--sp-7); text-align: center; color: var(--fg-muted); }

/* ── 窄屏 ─────────────────────────────────────────────────── */
@media (max-width: 1040px) {
  .head, .row { grid-template-columns: 200px minmax(0, 1fr) 188px 168px; gap: var(--sp-4); }
}
/* 四列排不开就折成 2×2：玩家与挑战一行，地图与进度一行。表头随之收起 ——
   头像、徽章、进度条本身已经说明了各自是什么。 */
@media (max-width: 860px) {
  .head { display: none; }
  .row {
    grid-template-columns: minmax(0, 1fr) 168px;
    grid-template-areas:
      "player    challenge"
      "map       progress";
    gap: var(--sp-2) var(--sp-4);
    padding-block: var(--sp-4);
  }
  .player { grid-area: player; }
  /* 头像宽 + 列间距：其余几格缩进到玩家名下方，一行读起来是一整块 */
  .map { grid-area: map; padding-left: 44px; }
  .challenge { grid-area: challenge; }
  .progress { grid-area: progress; }
}
@media (max-width: 560px) {
  .row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "player" "map" "challenge" "progress";
    gap: var(--sp-2);
    padding-inline: var(--sp-3);
  }
  .challenge, .progress { padding-left: 44px; }
  .toolbar { flex-wrap: wrap; gap: var(--sp-2); }
}
</style>
