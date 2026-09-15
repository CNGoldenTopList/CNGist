<script setup lang="ts">
/** 全站搜索页。与顶部搜索浮层同一份数据，区别是这里可以被收藏与分享。 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { NInput, NRadioButton, NRadioGroup } from "naive-ui";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { searchable } from "@shared/search";
import { catalog } from "@/lib/catalog";
import { useLanguage, type MessageKey } from "@/i18n";
import PageShell from "@/components/PageShell.vue";

type Kind = "player" | "map" | "campaign";
type SearchItem = { id: number; title: string; subtitle: string; href: string; kind: Kind };

/** 结果类型的显示名走词典；kind 本身是稳定的英文标识，不随语言变化。 */
const kindLabels: Record<Kind, MessageKey> = { player: "common.players", map: "common.maps", campaign: "common.campaigns" };

const RESULT_LIMIT = 120;

const { t } = useLanguage();
const query = ref("");
const kind = ref<"all" | Kind>("all");

const items = computed<SearchItem[]>(() => {
  const { campaigns, maps, players } = catalog.value;
  const all: SearchItem[] = [];

  if (kind.value === "all" || kind.value === "player") {
    for (const player of players) {
      if (!searchable([player.name, ...playerBilibiliUids(player)], player.aliases, query.value)) continue;
      const uids = playerBilibiliUids(player);
      all.push({
        id: player.id,
        title: player.name || String(player.id),
        subtitle: [uids.length ? `UID ${uids.join(" · ")}` : "", player.aliases?.join(" · ") || ""].filter(Boolean).join(" · "),
        href: `/player/${player.id}`,
        kind: "player",
      });
    }
  }
  if (kind.value === "all" || kind.value === "map") {
    for (const map of maps) {
      if (!searchable([map.name, map.cnName], map.searchAliases, query.value)) continue;
      all.push({ id: map.id, title: map.name, subtitle: map.cnName || map.searchAliases?.join(" · ") || "", href: `/map/${map.id}`, kind: "map" });
    }
  }
  if (kind.value === "all" || kind.value === "campaign") {
    for (const campaign of campaigns) {
      if (!searchable([campaign.name, campaign.cnName, campaign.shortName], campaign.searchAliases, query.value)) continue;
      all.push({ id: campaign.id, title: campaign.name, subtitle: campaign.cnName || campaign.searchAliases?.join(" · ") || "", href: `/campaign/${campaign.id}`, kind: "campaign" });
    }
  }
  return all.slice(0, RESULT_LIMIT);
});

const kinds: Kind[] = ["player", "map", "campaign"];
</script>

<template>
  <PageShell :eyebrow="t('nav.globalSearch')" :title="t('searchPage.title')" :lede="t('searchPage.lede')" width="wide">
    <NInput
      v-model:value="query"
      class="search"
      size="large"
      clearable
      autofocus
      :placeholder="t('searchPage.placeholder')"
      :aria-label="t('search.label')"
    />

    <div class="toolbar">
      <NRadioGroup v-model:value="kind" size="small" :aria-label="t('searchPage.type')">
        <NRadioButton value="all">{{ t("common.all") }}</NRadioButton>
        <NRadioButton v-for="value in kinds" :key="value" :value="value">{{ t(kindLabels[value]) }}</NRadioButton>
      </NRadioGroup>
      <span class="count">
        {{ t("searchPage.results", { count: items.length }) }}{{ items.length === RESULT_LIMIT ? t("searchPage.truncated") : "" }}
      </span>
    </div>

    <p v-if="!items.length" class="empty">{{ t("searchPage.empty") }}</p>
    <ul v-else class="grid">
      <li v-for="item in items" :key="`${item.kind}-${item.id}`">
        <RouterLink class="card" :to="item.href">
          <span class="kind">{{ t(kindLabels[item.kind]) }}</span>
          <strong class="title">{{ item.title }}</strong>
          <small v-if="item.subtitle" class="subtitle">{{ item.subtitle }}</small>
        </RouterLink>
      </li>
    </ul>
  </PageShell>
</template>

<style scoped>
.search { max-width: 480px; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.count { font-size: var(--fs-sm); color: var(--fg-subtle); white-space: nowrap; }

/* 结果卡片：自适应网格，卡片本身只有地面色差，不画边框。 */
.grid { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-3); }
.card {
  display: grid;
  gap: 2px;
  align-content: start;
  height: 100%;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-inset);
  border-radius: var(--r-md);
  color: var(--fg-secondary);
  min-width: 0;
  transition: background-color var(--dur-fast) var(--ease);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) {
  .card:hover { background: var(--bg-raised); }
}
/* 颜色钉在 @media 外：触摸设备不匹配 (hover: hover)，
   否则手指按下去时全局的 a:hover 会把文字变成链接蓝。 */
.card:hover,
.card:active,
.card:focus { color: var(--fg-secondary); }
.card:active { background: var(--bg-raised); }
.card:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.kind { font-size: var(--fs-micro); letter-spacing: .1em; color: var(--fg-subtle); }
.title { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: anywhere; }
.subtitle { font-size: var(--fs-micro); color: var(--fg-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty { margin: 0; padding: var(--sp-7) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }
</style>
