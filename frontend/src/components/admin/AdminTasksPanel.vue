<script setup lang="ts">
/** 把各来源的管理事项合并成统一的未完成与已完成待办。 */
import { computed, ref } from "vue";
import { NButton } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import type { AdminTask, FeedbackAttachment, TaskBoard } from "@shared/admin";
import { catalog } from "@/lib/catalog";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import AdminPager from "@/components/admin/AdminPager.vue";

const props = defineProps<{ board: TaskBoard }>();

const PAGE_SIZE = 20;
const pendingPage = ref(1);
const completedPage = ref(1);

type PendingTask = {
  key: string; id: number; type: string; title: string; detail: string;
  createdAt?: string; href?: string; source: "feedback" | "opinion" | "other";
  task?: AdminTask; attachments?: FeedbackAttachment[];
};

const pending = computed<PendingTask[]>(() => [
  ...props.board.feedbackReports.filter((item) => item.status === "pending").map((item) => ({
    key: `feedback-${item.id}`, id: item.id, type: "玩家反馈", title: item.title, detail: item.detail,
    createdAt: item.createdAt, href: item.pageUrl, source: "feedback" as const, attachments: item.attachments,
  })),
  // 只是个提醒；真正的延期与同意／驳回在「意见箱」标签页里做。
  ...catalog.value.suggestions.filter((item) => item.state === "UNDECIDED").map((item) => ({
    key: `opinion-${item.id}`, id: item.id, type: "待处理意见箱", title: item.title,
    detail: "投票已结束 · 等待决定", href: "/admin?tab=suggestions", source: "opinion" as const,
  })),
  ...props.board.otherTasks.map((item) => ({
    key: `other-${item.id}`, id: item.id, type: item.type || "其他待办", title: item.title, detail: item.detail,
    createdAt: item.createdAt, href: item.href, source: "other" as const, task: item,
  })),
]);

const pendingRows = computed(() => pending.value.slice((pendingPage.value - 1) * PAGE_SIZE, pendingPage.value * PAGE_SIZE));
const completedRows = computed(() => props.board.completedTasks.slice((completedPage.value - 1) * PAGE_SIZE, completedPage.value * PAGE_SIZE));

async function run(path: string, success: string) {
  try {
    await sendAdminCommand(path, { method: "PATCH" });
    toast.success(success);
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败。");
  }
}
</script>

<template>
  <div class="board">
    <section class="adm-section">
      <h2 class="section-title">未完成待办<small>{{ pending.length }}</small></h2>
      <p v-if="!pendingRows.length" class="adm-empty">暂无未完成待办。</p>
      <ul v-else class="adm-list">
        <li v-for="item in pendingRows" :key="item.key" class="adm-row">
          <div class="adm-row-main">
            <span class="adm-row-kind">{{ item.type }}</span>
            <span class="adm-row-title">{{ item.title }}</span>
            <p class="adm-row-detail">{{ item.detail }}</p>
            <!-- 反馈配图：后台列表里只放缩略，点开在新标签看原图。 -->
            <ul v-if="item.attachments?.length" class="adm-attachments">
              <li v-for="attachment in item.attachments" :key="attachment.id">
                <a :href="attachment.url" target="_blank" rel="noreferrer noopener">
                  <img :src="attachment.url" alt="反馈截图" loading="lazy" />
                </a>
              </li>
            </ul>
            <span v-if="item.createdAt" class="adm-row-time">{{ formatBeijingDateTime(item.createdAt) }}</span>
          </div>
          <div class="adm-row-actions">
            <NButton v-if="item.href" tag="a" :href="item.href" size="small" quaternary>打开</NButton>
            <NButton v-if="item.source === 'feedback'" size="small" @click="run(`/api/admin/feedback/${item.id}`, '反馈已标记处理。')">标记已处理</NButton>
            <NButton v-if="item.source === 'other'" size="small" @click="run(`/api/admin/tasks/${item.id}`, '待办已标记完成。')">标记完成</NButton>
          </div>
        </li>
      </ul>
      <AdminPager v-model:page="pendingPage" :item-count="pending.length" :page-size="PAGE_SIZE" />
    </section>

    <section class="adm-section">
      <h2 class="section-title">已完成待办<small>{{ board.completedTasks.length }}</small></h2>
      <p v-if="!completedRows.length" class="adm-empty">暂无已完成待办。</p>
      <ul v-else class="adm-list">
        <li v-for="item in completedRows" :key="item.id" class="adm-row">
          <div class="adm-row-main">
            <span class="adm-row-kind">{{ item.type || "其他待办" }}</span>
            <span class="adm-row-title">{{ item.title }}</span>
            <p class="adm-row-detail">{{ item.detail }}</p>
            <span class="adm-row-time">{{ item.completedBy || "管理员" }} · {{ formatBeijingDateTime(item.completedAt) }}</span>
          </div>
          <div v-if="item.href" class="adm-row-actions">
            <NButton tag="a" :href="item.href" size="small" quaternary>打开</NButton>
          </div>
        </li>
      </ul>
      <AdminPager v-model:page="completedPage" :item-count="board.completedTasks.length" :page-size="PAGE_SIZE" />
    </section>
  </div>
</template>

<style scoped>
.board { display: grid; gap: var(--sp-6); }
.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.section-title small {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  font-weight: var(--fw-normal);
  color: var(--fg-subtle);
}
</style>
