<script setup lang="ts">
/**
 * 后台记录（审计日志）。只保留 30 天，按日期区间与页码由服务端过滤。
 *
 * 审计里存的是实体编号，直接显示就是一串裸数字。这里按目录把编号换回名字 ——
 * 换不出来的保持原样，不要编一个假名字。
 */
import { computed, ref, watch } from "vue";
import { NDatePicker } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import type { AdminRecord, AuditItem } from "@shared/admin";
import { catalog } from "@/lib/catalog";
import { challengeContext, playerName } from "@/lib/projection";
import { fetchAudit } from "@/lib/admin-resources";
import LoadState from "@/components/LoadState.vue";
import AdminPager from "@/components/admin/AdminPager.vue";
import PanelBlock from "@/components/PanelBlock.vue";

const props = defineProps<{ records: AdminRecord[] }>();

const PAGE_SIZE = 20;
const page = ref(1);
const range = ref<[number, number] | null>(null);
const items = ref<AuditItem[]>([]);
const total = ref(0);
const loading = ref(false);

const asDate = (value: number) => new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

watch([page, range], async () => {
  loading.value = true;
  const result = await fetchAudit({
    from: range.value ? asDate(range.value[0]) : undefined,
    to: range.value ? asDate(range.value[1]) : undefined,
    limit: PAGE_SIZE,
    offset: (page.value - 1) * PAGE_SIZE,
  });
  items.value = result.items;
  total.value = result.total;
  loading.value = false;
}, { immediate: true });

watch(range, () => { page.value = 1; });

/** 目录里能查到名字的实体编号。 */
const names = computed(() => {
  const map = new Map<string, string>();
  for (const item of catalog.value.campaigns) map.set(String(item.id), item.name);
  for (const item of catalog.value.maps) map.set(String(item.id), item.name);
  for (const item of catalog.value.challenges) map.set(String(item.id), challengeContext(item.id).label);
  for (const item of catalog.value.campaignHalls) map.set(String(item.id), item.name);
  for (const item of catalog.value.players) map.set(String(item.id), item.name);
  for (const item of props.records) map.set(String(item.id), `${playerName(item.playerId)} · ${challengeContext(item.challengeId ?? 0).label}`);
  return map;
});

/** `#123` 这类编号引用换成名字；换不出来的保持原样。 */
function humanize(detail: string) {
  return detail.replace(/#(\d+)/g, (match, id: string) => names.value.get(id) ?? match);
}

/** 第一行是标题，其余按项列出 —— 审计详情多是「动作 + 若干变更」。 */
function lines(detail: string) {
  const all = humanize(detail).split("\n").map((line) => line.trim()).filter(Boolean);
  return { head: all[0] || "—", rest: all.slice(1).map((line) => line.replace(/^[-•]\s*/, "")) };
}
</script>

<template>
  <PanelBlock title="后台记录" subtitle="仅保留 30 天">
    <template #actions>
      <NDatePicker v-model:value="range" type="daterange" clearable class="range" aria-label="日期区间" />
    </template>

    <LoadState v-if="loading" label="正在加载后台记录" />
    <template v-else>
      <article v-for="item in items" :key="item.id" class="row">
        <time class="time">{{ formatBeijingDateTime(item.at) }}</time>
        <span class="type">{{ item.type }}</span>
        <div class="detail">
          <p>{{ lines(item.detail).head }}</p>
          <ul v-if="lines(item.detail).rest.length">
            <li v-for="(line, index) in lines(item.detail).rest" :key="index">{{ line }}</li>
          </ul>
        </div>
        <em class="actor">{{ item.actor || "系统" }}</em>
      </article>
      <p v-if="!items.length" class="adm-empty">暂无后台记录</p>
      <AdminPager v-model:page="page" :item-count="total" :page-size="PAGE_SIZE" />
    </template>
  </PanelBlock>
</template>

<style scoped>
.range { width: 260px; }
.row {
  display: grid;
  grid-template-columns: 165px 130px minmax(0, 1fr) 110px;
  align-items: start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--hairline);
}
.time { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-size: var(--fs-sm); color: var(--fg-subtle); }
.type { font-size: var(--fs-sm); color: var(--fg-muted); }
.actor { font-size: var(--fs-sm); text-align: right; color: var(--fg-subtle); font-style: normal; }
.detail { min-width: 0; }
.detail p { margin: 0; font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); }
.detail ul {
  display: grid;
  gap: 2px;
  margin: var(--sp-1) 0 0;
  padding-left: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
}

@media (max-width: 900px) {
  .row { grid-template-columns: 1fr; }
  .actor { text-align: left; }
}
</style>
