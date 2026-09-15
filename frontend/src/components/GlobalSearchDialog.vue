<script setup lang="ts">
/**
 * 全站搜索浮层。玩家、地图、地图包三类结果各自成组。
 *
 * 外壳交给 NModal：焦点陷阱、Esc 关闭、滚动锁、关闭后焦点归位都由它保证。
 * 搜索是纯客户端的，跑在已经拉下来的目录上，不发请求，所以输入即出结果。
 */
import { computed, nextTick, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { NInput, NModal, NPagination, NTab, NTabs } from "naive-ui";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { searchable } from "@shared/search";
import { catalog } from "@/lib/catalog";
import { useLanguage } from "@/i18n";
import LocalizedName from "@/components/LocalizedName.vue";

const show = defineModel<boolean>("show", { required: true });
const { t } = useLanguage();

const PLAYER_PAGE_SIZE = 12;

const query = ref("");
const tab = ref<"maps" | "campaigns">("maps");
const playerPage = ref(1);
const input = ref<InstanceType<typeof NInput> | null>(null);

const trimmed = computed(() => query.value.trim());

const playerResults = computed(() => !trimmed.value ? []
  : catalog.value.players.filter((player) => searchable([player.name, ...playerBilibiliUids(player)], player.aliases, query.value)));
const mapResults = computed(() => !trimmed.value ? []
  : catalog.value.maps.filter((map) => searchable([map.name, map.cnName], map.searchAliases, query.value)));
const campaignResults = computed(() => !trimmed.value ? []
  : catalog.value.campaigns.filter((campaign) => searchable([campaign.name, campaign.cnName, campaign.shortName], campaign.searchAliases, query.value)));

const pagedPlayers = computed(() =>
  playerResults.value.slice((playerPage.value - 1) * PLAYER_PAGE_SIZE, playerPage.value * PLAYER_PAGE_SIZE));
const entities = computed(() => (tab.value === "maps" ? mapResults.value : campaignResults.value));

watch(query, () => { playerPage.value = 1; });

/* 用户唤出搜索就是为了打字，焦点直接落在输入框里。 */
watch(show, (open) => {
  query.value = "";
  playerPage.value = 1;
  if (open) void nextTick(() => window.setTimeout(() => input.value?.focus(), 40));
});
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="t('search.title')" class="search-modal" size="huge" :bordered="false" style="max-width: 760px; width: calc(100vw - 32px)">
    <template #header>
      <div class="search-heading">
        <span>{{ t("search.title") }}</span>
        <span class="subtitle">{{ t("search.subtitle") }}</span>
      </div>
    </template>

    <NInput
      ref="input"
      v-model:value="query"
      type="text"
      size="large"
      clearable
      :placeholder="t('search.placeholder')"
      :aria-label="t('search.label')"
    />

    <p v-if="!trimmed" class="hint">{{ t("search.hint") }}</p>
    <template v-else>
      <section class="group">
        <h3 class="group-title">{{ t("common.players") }}<small>{{ playerResults.length }}</small></h3>
        <div v-if="playerResults.length" class="players">
          <RouterLink v-for="player in pagedPlayers" :key="player.id" :to="`/player/${player.id}`" class="player" @click="show = false">
            {{ player.name }}
          </RouterLink>
        </div>
        <p v-else class="empty">{{ t("search.noPlayers") }}</p>
        <NPagination
          v-if="playerResults.length > PLAYER_PAGE_SIZE"
          v-model:page="playerPage"
          :page-size="PLAYER_PAGE_SIZE"
          :item-count="playerResults.length"
          size="small"
        />
      </section>

      <section class="group">
        <NTabs show-scroll-button v-model:value="tab" type="line" size="small">
          <NTab name="maps">{{ t("common.maps") }} <small>{{ mapResults.length }}</small></NTab>
          <NTab name="campaigns">{{ t("common.campaigns") }} <small>{{ campaignResults.length }}</small></NTab>
        </NTabs>
        <div v-if="entities.length" class="entities">
          <RouterLink
            v-for="entity in entities"
            :key="entity.id"
            :to="tab === 'maps' ? `/map/${entity.id}` : `/campaign/${entity.id}`"
            class="entity"
            @click="show = false"
          >
            <span class="thumb" aria-hidden="true">
              <img v-if="entity.banner" :src="entity.banner" alt="" loading="lazy" />
            </span>
            <LocalizedName :name="entity.name" :cn-name="entity.cnName" :aliases="entity.searchAliases" truncate />
          </RouterLink>
        </div>
        <p v-else class="empty">{{ t("search.empty") }}</p>
      </section>
    </template>
  </NModal>
</template>

<style scoped>
.search-heading { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; }
.subtitle { font-size: var(--fs-sm); font-weight: var(--fw-normal); color: var(--fg-subtle); }

.hint, .empty {
  margin: 0;
  padding: var(--sp-5) 0;
  text-align: center;
  font-size: var(--fs-body);
  color: var(--fg-subtle);
}
.empty { padding: var(--sp-4) 0; text-align: left; }

.group { display: grid; gap: var(--sp-3); margin-top: var(--sp-5); }
.group-title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.group-title small {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
}

/* 玩家名是短标签，铺成自适应的胶囊网格 */
.players { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.player {
  padding: var(--sp-2) var(--sp-3);
  border: var(--hairline);
  border-radius: var(--r-pill);
  background: var(--bg-inset);
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
}
@media (hover: hover) {
  .player:hover { border-color: var(--border-focus); color: var(--link); }
}

/* 地图与地图包带封面缩略图，缩略图固定尺寸不参与伸缩 */
.entities { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2); max-height: 42vh; overflow-y: auto; }
.entity {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--r-sm);
  color: var(--fg-secondary);
  transition: background-color var(--dur-fast) var(--ease);
}
@media (hover: hover) {
  .entity:hover { background: var(--bg-raised); color: var(--fg-default); }
}
.thumb {
  flex: 0 0 auto;
  width: 44px;
  height: 30px;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--bg-overlay);
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
@media (max-width: 760px) {
  .search-heading { flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
  .entities { max-height: none; overflow-y: visible; }
}
</style>
