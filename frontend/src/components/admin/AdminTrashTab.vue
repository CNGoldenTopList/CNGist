<script setup lang="ts">
/**
 * 回收站。恢复任何人可做；确认删除只有超级管理员 —— 那一步不可恢复。
 */
import { computed, ref, watch } from "vue";
import { NButton, NInput } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import type { TrashItem } from "@shared/admin";
import { searchable } from "@shared/search";
import { sendAdminCommand } from "@/lib/admin-resources";
import { confirmAction, toast } from "@/lib/feedback";
import AdminPager from "@/components/admin/AdminPager.vue";

const props = defineProps<{ items: TrashItem[]; superAdmin: boolean }>();

const PAGE_SIZE = 20;
const query = ref("");
const page = ref(1);
watch(query, () => { page.value = 1; });

const filtered = computed(() => props.items.filter((item) => !query.value.trim()
  || searchable([item.label, item.kind], undefined, query.value)));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

async function run(path: string, body: unknown, success: string) {
  try {
    await sendAdminCommand(path, { body });
    toast.success(success);
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
  }
}

const restore = (item: TrashItem) => run(`/api/admin/trash/${item.id}`, { action: "restore" }, "已从回收站恢复。");

async function confirmDelete(item: TrashItem) {
  const confirmed = await confirmAction({
    title: "确认删除",
    content: `彻底删除「${item.label}」${{
      campaign: "及其所有地图、地图挑战、地图包级挑战和全部挑战记录",
      map: "及其所有挑战和全部挑战记录",
      challenge: "及其全部挑战记录",
      record: "及其标签",
      player: "的玩家档案及全部挑战记录（登录账户保留）",
    }[item.kind]}？此操作无法恢复。`,
    positiveText: "确认删除",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void run(`/api/admin/trash/${item.id}`, { action: "confirm" }, "已确认删除。");
}
</script>

<template>
  <div class="adm-section">
    <NInput v-model:value="query" clearable placeholder="搜索回收站中的玩家、地图包、地图或挑战" aria-label="搜索回收站" />
    <ul class="adm-list">
      <li v-for="item in paged" :key="item.id" class="adm-row">
        <div class="adm-row-main">
          <span class="adm-row-title">{{ item.label }}</span>
          <span class="adm-row-time">{{ item.kind }} · {{ formatBeijingDateTime(item.deletedAt) }}</span>
        </div>
        <div class="adm-row-actions">
          <NButton size="small" @click="restore(item)">恢复</NButton>
          <NButton v-if="superAdmin" size="small" type="error" @click="confirmDelete(item)">确认删除</NButton>
        </div>
      </li>
    </ul>
    <p v-if="!paged.length" class="adm-empty">没有匹配的回收站项目。</p>
    <AdminPager v-model:page="page" :item-count="filtered.length" :page-size="PAGE_SIZE" />
  </div>
</template>
