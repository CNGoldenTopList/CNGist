<script setup lang="ts">
/**
 * 管理控制台。
 *
 * 按域取数：队列、回收站、待办随页面加载（顶部计数要用），玩家目录只在
 * 「管理玩家」标签页加载，审计按页按条件查。没有「一次拉全部」这回事。
 *
 * 十三个分区一字排开。原来那两个折叠组需要一个文档级 pointerdown 监听器
 * 才能点外面关掉，收进标签页后那套机制整个不需要了。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NInput, NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { isRecordTrashed } from "@shared/admin";
import { catalog, catalogReady } from "@/lib/catalog";
import { challengeContext, playerName } from "@/lib/projection";
import {
  adminPlayerClaims, adminPlayers, adminRecordsResource, adminTasks, adminTrash, useAdminResource,
} from "@/lib/admin-resources";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import LoadState from "@/components/LoadState.vue";
import LinkButton from "@/components/LinkButton.vue";
import AdminReviewTab from "@/components/admin/AdminReviewTab.vue";
import AdminAddRecordTab from "@/components/admin/AdminAddRecordTab.vue";
import AdminPlayersTab from "@/components/admin/AdminPlayersTab.vue";
import AdminChallengesTab from "@/components/admin/AdminChallengesTab.vue";
import AdminSummaryTab from "@/components/admin/AdminSummaryTab.vue";
import AdminTrashTab from "@/components/admin/AdminTrashTab.vue";
import AdminAuditTab from "@/components/admin/AdminAuditTab.vue";
import AdminTasksPanel from "@/components/admin/AdminTasksPanel.vue";
import AdminSuggestionsPanel from "@/components/admin/AdminSuggestionsPanel.vue";
import AdminAccountsPanel from "@/components/admin/AdminAccountsPanel.vue";
import AdminGoldenRoomPanel from "@/components/admin/AdminGoldenRoomPanel.vue";
import AdminMapBindingsPanel from "@/components/admin/AdminMapBindingsPanel.vue";

type AdminTab =
  | "pending" | "add" | "reviewed" | "players" | "challenges" | "map-bindings"
  | "tasks" | "suggestions" | "summary" | "trash" | "audit" | "accounts" | "golden-rooms";

const tabs: Array<[AdminTab, string]> = [
  ["pending", "待审核"], ["add", "添加记录"], ["reviewed", "已审核记录"], ["players", "管理玩家"],
  ["challenges", "挑战管理"], ["map-bindings", "地图配对申请"], ["tasks", "待处理"], ["suggestions", "意见箱"],
  ["summary", "每日总结"], ["trash", "回收站"], ["audit", "后台记录"], ["accounts", "管理员权限"],
  ["golden-rooms", "Ping 点"],
];

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { account, isAdmin, adminMode } = storeToRefs(session);

const initialTab = (): AdminTab => {
  const wanted = route.query.tab as AdminTab | undefined;
  if (wanted && tabs.some(([value]) => value === wanted)) return wanted;
  return route.query.q ? "challenges" : "pending";
};

const tab = ref<AdminTab>(initialTab());
const query = ref((route.query.q as string) || "");

/* 标签页写回地址栏，刷新和分享都落在同一个分区上。 */
watch(tab, (value) => { void router.replace({ path: route.path, query: { ...route.query, tab: value } }); });

const enabled = computed(() => isAdmin.value && adminMode.value);
const { data: records, loaded: recordsLoaded } = useAdminResource(adminRecordsResource, enabled);
const { data: trash } = useAdminResource(adminTrash, enabled);
const { data: taskBoard } = useAdminResource(adminTasks, enabled);
const { data: playerDirectory } = useAdminResource(adminPlayers, computed(() => enabled.value && tab.value === "players"));
const { data: playerClaims } = useAdminResource(adminPlayerClaims, computed(() => enabled.value && tab.value === "players"));

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const q = computed(() => normalize(query.value));

const queue = computed(() => records.value.filter((record) => record.status === "pending"
  && !isRecordTrashed(trash.value, record.id)
  && (!q.value || normalize([
    playerName(record.playerId),
    challengeContext(record.challengeId ?? 0).label,
    record.proposedTarget ? Object.values(record.proposedTarget).join(" ") : "",
    record.marks.join(" "),
    (record.reviewTags || []).map((tag) => tag.text).join(" "),
  ].join(" ")).includes(q.value))));

const reviewed = computed(() => records.value.filter((record) => record.status !== "pending"
  && !isRecordTrashed(trash.value, record.id)
  && (!q.value || normalize(`${playerName(record.playerId)} ${challengeContext(record.challengeId ?? 0).label}`).includes(q.value))));

const pendingCount = computed(() => records.value.filter((record) => record.status === "pending" && !isRecordTrashed(trash.value, record.id)).length);
const undecidedSuggestions = computed(() => catalog.value.suggestions.filter((item) => item.state === "UNDECIDED").length);
const pendingTasks = computed(() => taskBoard.value.feedbackReports.filter((item) => item.status === "pending").length
  + undecidedSuggestions.value
  + taskBoard.value.otherTasks.length);

const superAdmin = computed(() => account.value?.role === "super_admin");
const visibleTabs = computed(() => tabs.filter(([value]) => value !== "accounts" || superAdmin.value));
const tabBadge = (value: AdminTab) => (value === "tasks" ? pendingTasks.value : value === "suggestions" ? undecidedSuggestions.value : 0);
const searchable = computed(() => ["pending", "reviewed", "players", "challenges"].includes(tab.value));

const targetKind = computed(() => route.query.entity as string | undefined);
const targetId = computed(() => (route.query.id ? Number(route.query.id) : undefined));
</script>

<template>
  <PageShell v-if="!catalogReady" eyebrow="金榜管理" title="管理控制台" width="wide">
    <LoadState label="正在载入目录数据" />
  </PageShell>

  <PageShell
    v-else-if="!account"
    eyebrow="金榜管理"
    title="需要管理员身份"
    lede="请先登录一个具有管理权限的账户。"
    width="wide"
  >
    <div><LinkButton to="/account" type="primary">前往登录</LinkButton></div>
  </PageShell>

  <PageShell
    v-else-if="!isAdmin"
    eyebrow="金榜管理"
    title="没有管理权限"
    lede="当前账户不是金榜管理员。"
    width="wide"
  >
    <div><LinkButton to="/account">返回个人账户</LinkButton></div>
  </PageShell>

  <PageShell
    v-else-if="!adminMode"
    eyebrow="金榜管理"
    title="当前处于玩家模式"
    lede="请从右上角个人菜单切换到管理模式后再打开后台。"
    width="wide"
  >
    <div><LinkButton to="/">返回主页</LinkButton></div>
  </PageShell>

  <PageShell v-else eyebrow="金榜管理" title="管理控制台" width="wide">
    <template #actions>
      <div class="stats">
        <span class="stat"><b>{{ pendingCount }}</b><span>待审核</span></span>
        <span class="stat"><b>{{ pendingTasks }}</b><span>待处理</span></span>
      </div>
    </template>

    <div class="toolbar">
      <NTabs
        v-model:value="tab"
        justify-content="space-around"
        :tab-style="{ paddingInline: 'var(--sp-3)' }"
        show-scroll-button
        type="line"
        size="small"
        aria-label="后台分区"
      >
        <NTab v-for="[value, label] in visibleTabs" :key="value" :name="value">
          <span class="tab-label">
            <span>{{ label }}</span>
            <span v-if="tabBadge(value)">{{ tabBadge(value) }}</span>
          </span>
        </NTab>
      </NTabs>
      <NInput
        v-if="searchable"
        v-model:value="query"
        clearable
        :placeholder="tab === 'players' ? '搜索玩家名或 B站 UID' : '搜索玩家、地图包、地图或挑战'"
        aria-label="搜索"
      />
    </div>

    <LoadState v-if="!recordsLoaded && (tab === 'pending' || tab === 'reviewed')" label="正在载入审核队列" />
    <template v-else>
      <AdminReviewTab v-if="tab === 'pending'" :records="queue" :directory="playerDirectory" pending />
      <AdminReviewTab v-else-if="tab === 'reviewed'" :records="reviewed" :directory="playerDirectory" :pending="false" />
      <AdminAddRecordTab v-else-if="tab === 'add'" :directory="playerDirectory" />
      <AdminPlayersTab v-else-if="tab === 'players'" :query="query" :records="records" :directory="playerDirectory" :claims="playerClaims" />
      <AdminChallengesTab v-else-if="tab === 'challenges'" :query="query" :target-kind="targetKind" :target-id="targetId" />
      <AdminMapBindingsPanel v-else-if="tab === 'map-bindings'" />
      <AdminTasksPanel v-else-if="tab === 'tasks'" :board="taskBoard" />
      <AdminSuggestionsPanel v-else-if="tab === 'suggestions'" />
      <AdminSummaryTab v-else-if="tab === 'summary'" :records="records" :trash="trash" />
      <AdminTrashTab v-else-if="tab === 'trash'" :items="trash" :super-admin="superAdmin" />
      <AdminAuditTab v-else-if="tab === 'audit'" :records="records" />
      <AdminAccountsPanel v-else-if="tab === 'accounts' && superAdmin" />
      <AdminGoldenRoomPanel v-else-if="tab === 'golden-rooms'" />
    </template>
  </PageShell>
</template>

<style scoped>
.tab-label { display: inline-flex; align-items: baseline; gap: var(--sp-2); }
/* 页头右侧的两个计数：数字压在标签上方，与首页的数据概览同一套读法。 */
.stats { display: flex; align-items: center; gap: var(--sp-5); }
.stat { display: grid; gap: 2px; justify-items: end; }
.stat b {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  line-height: 1;
  color: var(--fg-default);
}
.stat span { font-size: var(--fs-micro); color: var(--fg-subtle); }

.toolbar { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); margin-bottom: var(--sp-4); }
</style>
