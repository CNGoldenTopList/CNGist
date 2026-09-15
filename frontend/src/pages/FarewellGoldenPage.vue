<script setup lang="ts">
/**
 * 第九章金草莓专页。
 *
 * 它有自己的一张表：这里关心的是「谁在什么时候打的、有没有月莓和 DTS」，
 * 与通用的通关记录表列不同，因此不复用 RecordTable。
 * 按达成时间正序排 —— 这一页读的是历史顺序，不是排行榜。
 */
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { formatDate } from "@shared/datetime";
import type { Submission } from "@shared/types";
import { api } from "@/lib/api";
import { getPlayer } from "@/lib/selectors";
import { useLanguage } from "@/i18n";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";

const { t, locale } = useLanguage();
const records = ref<Submission[]>([]);

onMounted(async () => {
  const { ok, data } = await api.get<{ records?: Submission[] }>("/api/farewell");
  if (ok) records.value = data.records ?? [];
});

const hasTag = (tags: string[] | undefined, pattern: RegExp) => Boolean(tags?.some((tag) => pattern.test(tag.trim())));
const nameOf = (record: Submission) => record.playerDisplayName || getPlayer(record.playerId)?.name || String(record.playerId);
</script>

<template>
  <PageShell eyebrow="Celeste" :title="t('home.farewell')" :lede="t('farewell.lede')">
    <PanelBlock :title="t('farewell.list')" :subtitle="t('farewell.people', { count: records.length })">
      <p v-if="!records.length" class="empty">{{ t("farewell.empty") }}</p>
      <div v-else class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th scope="col" class="col-index">#</th>
              <th scope="col">{{ t("common.players") }}</th>
              <th scope="col" class="col-tag">{{ t("farewell.moon") }}</th>
              <th scope="col" class="col-tag">DTS</th>
              <th scope="col" class="col-link">{{ t("common.video") }}</th>
              <th scope="col" class="col-date">{{ t("records.date") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(record, index) in records" :key="record.id">
              <td class="col-index num">{{ index + 1 }}</td>
              <td><RouterLink :to="`/player/${record.playerId}`" class="player">{{ nameOf(record) }}</RouterLink></td>
              <td class="col-tag">
                <em v-if="hasTag(record.tags, /^(moon|月莓|FC)$/i)" class="tag tag-moon">{{ t("farewell.moon") }}</em>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-tag">
                <em v-if="hasTag(record.tags, /^DTS$/i)" class="tag tag-dts">DTS</em>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-link">
                <a v-if="record.videoUrl" :href="record.videoUrl" target="_blank" rel="noreferrer" class="link">{{ t("common.video") }}</a>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-date num">{{ formatDate(record.achievedAt, locale) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PanelBlock>
  </PageShell>
</template>

<style scoped>
/* 与通用记录表同一套形态：真 <table>、细线分隔、固定槽位。 */
.scroll { overflow-x: auto; margin-inline: calc(var(--sp-3) * -1); padding-inline: var(--sp-3); }
.table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: var(--fs-body); }

.table th {
  padding: 0 var(--sp-3) var(--sp-2);
  text-align: left;
  white-space: nowrap;
  border-bottom: var(--hairline);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .06em;
  color: var(--fg-subtle);
}
.table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--hairline); color: var(--fg-secondary); }

.col-index { width: 48px; }
.col-tag { width: 68px; }
.col-link { width: 60px; }
.col-date { width: 108px; white-space: nowrap; }

.num { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); color: var(--fg-subtle); }
.muted { color: var(--fg-disabled); }

.player { font-weight: var(--fw-medium); color: var(--link); overflow-wrap: anywhere; }
.link { color: var(--link); }
@media (hover: hover) {
  .player:hover, .link:hover { color: var(--link-hover); text-decoration: underline; }
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--sp-2);
  border: 1px solid var(--tag-tone, var(--border-default));
  border-radius: var(--r-sm);
  font-size: var(--fs-micro);
  font-style: normal;
  font-weight: var(--fw-medium);
  white-space: nowrap;
  color: var(--tag-tone, var(--fg-muted));
}
/* 与记录表同一套 --mark-*：月莓与 FC 是同义标签，两张表里必须同色。 */
.tag-moon { --tag-tone: var(--mark-moon); }
.tag-dts { --tag-tone: var(--mark-dts); }

.empty { margin: 0; padding: var(--sp-7) 0; text-align: center; color: var(--fg-subtle); }
</style>
