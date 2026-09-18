<script setup lang="ts">
/** 地图配对审核：可展开的一列，审核动作收在展开区里。 */
import { computed, onMounted, ref, watch } from "vue";
import { NButton, NInput, NTab, NTabs } from "naive-ui";
import { searchable } from "@shared/search";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import LoadState from "@/components/LoadState.vue";
import AdminPager from "@/components/admin/AdminPager.vue";
import AdminMapBindingRow from "@/components/admin/AdminMapBindingRow.vue";

type Binding = {
  id: number; sid: string; side: string; mapId: number;
  mapName: string; campaignName: string; proposedBy: string;
  createdAt: string; reviewedAt: string | null;
};
type Status = "pending" | "approved";
type Payload = Record<Status, Binding[]>;

const PAGE_SIZE = 10;
const sideLabel = (side: string) => ({ Normal: "A 面", BSide: "B 面", CSide: "C 面" }[side] ?? side);

const data = ref<Payload | null>(null);
const error = ref("");
const status = ref<Status>("pending");
const query = ref("");
const page = ref(1);
const expanded = ref<number | null>(null);

async function reload() {
  const { ok, data: body } = await api.get<{ data?: Payload }>("/api/admin/map-bindings");
  if (!ok || !body.data) { error.value = body.error || "地图配对加载失败，请重试。"; return; }
  data.value = body.data;
  error.value = "";
}
onMounted(reload);

watch([status, query], () => { page.value = 1; expanded.value = null; });

const filtered = computed(() => (data.value?.[status.value] ?? []).filter((item) => !query.value.trim()
  || searchable([item.sid, sideLabel(item.side), item.mapName, item.campaignName, item.proposedBy], undefined, query.value.trim())));
const rows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

async function review(item: Binding, note: string, reject: boolean) {
  const pending = status.value === "pending";
  const body = pending ? { id: item.id, status: reject ? "rejected" : "approved", note } : { id: item.id, revoke: true, note };
  try {
    await sendAdminCommand("/api/admin/map-bindings", { method: "PATCH", body });
    toast.success(pending ? (reject ? "已驳回。" : "配对已生效。") : "配对已撤销。");
    expanded.value = null;
    await reload();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败。");
  }
}

const emptyText = computed(() => {
  if (query.value.trim()) return "没有符合搜索条件的配对。";
  return status.value === "pending" ? "没有待审核的地图配对。" : "暂无已生效的配对。";
});
</script>

<template>
  <section class="adm-section" aria-label="地图配对申请">
    <div class="toolbar">
      <NTabs justify-content="space-around" show-scroll-button v-model:value="status" type="line" size="small" class="tabs" aria-label="配对状态">
        <NTab name="pending">待审核 {{ data?.pending.length || "" }}</NTab>
        <NTab name="approved">已生效 {{ data?.approved.length || "" }}</NTab>
      </NTabs>
      <NInput v-model:value="query" clearable placeholder="搜索游戏标识、地图包、地图或提交人" aria-label="搜索地图配对" />
    </div>

    <p class="hint">
      {{ status === "pending" ? "核对游戏标识与目录地图，通过后全站共用。" : "已生效的配对供全站共用；撤销后可重新指认。" }}
    </p>

    <div v-if="error" class="adm-actions">
      <p class="adm-warn" role="alert">{{ error }}</p>
      <NButton size="small" quaternary @click="reload">重新加载</NButton>
    </div>

    <LoadState v-if="!data && !error" label="正在加载地图配对…" />

    <template v-if="data">
      <div class="rows">
        <AdminMapBindingRow
          v-for="item in rows"
          :key="item.id"
          :item="item"
          :pending="status === 'pending'"
          :open="expanded === item.id"
          @toggle="expanded = expanded === item.id ? null : item.id"
          @review="(note: string, reject: boolean) => review(item, note, reject)"
        />
        <p v-if="!rows.length" class="adm-empty">{{ emptyText }}</p>
      </div>
      <AdminPager v-model:page="page" :item-count="filtered.length" :page-size="PAGE_SIZE" />
    </template>
  </section>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.tabs { flex: 0 0 auto; width: 220px; }
.hint { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
.rows { display: grid; gap: var(--sp-3); }
</style>
