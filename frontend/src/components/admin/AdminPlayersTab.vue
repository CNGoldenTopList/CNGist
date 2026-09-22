<script setup lang="ts">
/**
 * 玩家管理。
 *
 * 绑定邮箱与 QQ 属于认领该玩家的账户，由玩家自己在账户页维护，后台只读展示 ——
 * 做成可编辑但服务端不接受，等于骗管理员按了一个没用的保存。
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NInput, NSelect } from "naive-ui";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { isRecordTrashed, type AdminRecord, type PlayerClaimRequestItem, type PlayerDirectory, type ReviewTag } from "@shared/admin";
import type { PlayerStatus } from "@shared/types";
import { searchable } from "@shared/search";
import { catalog } from "@/lib/catalog";
import { challengeContext, playerName } from "@/lib/projection";
import { adminTrash, applyEffects, sendAdminCommand } from "@/lib/admin-resources";
import { api } from "@/lib/api";
import { confirmAction, toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import AdminPager from "@/components/admin/AdminPager.vue";
import AdminPlayerBindingPanel from "@/components/admin/AdminPlayerBindingPanel.vue";
import AdminTagEditor from "@/components/admin/AdminTagEditor.vue";

const props = defineProps<{
  query: string;
  records: AdminRecord[];
  directory: PlayerDirectory;
  claims: PlayerClaimRequestItem[];
}>();

const statusLabels: Record<PlayerStatus, string> = {
  unasked: "未询问", normal: "正常", unreplied: "未回复", unwilling: "不愿意上榜", blocked: "榜拒绝接受",
};
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

const PAGE_SIZE = 20;
const page = ref(1);
const expanded = ref<number | null>(null);
const editingCompletion = ref<number | null>(null);
const creating = ref(false);
const newPlayer = ref({ name: "", bilibiliUid: "" });
const edits = ref<Record<number, { displayName: string; status: PlayerStatus; bilibiliUids: string }>>({});

watch(() => props.query, () => { page.value = 1; });

const filtered = computed(() => catalog.value.players.filter((player) => !props.query.trim()
  || searchable([String(player.id), player.name, ...playerBilibiliUids(player)], player.aliases, props.query)));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const pendingClaims = computed(() => props.claims.filter((request) => request.status === "pending"));

function editOf(playerId: number) {
  if (edits.value[playerId]) return edits.value[playerId];
  const player = catalog.value.players.find((item) => item.id === playerId);
  return {
    bilibiliUids: playerBilibiliUids(player ?? {}).join("\n"),
    displayName: player?.name || "",
    status: (props.directory.statuses[String(playerId)] || player?.status || "unasked") as PlayerStatus,
  };
}
const setEdit = (playerId: number, patch: Partial<ReturnType<typeof editOf>>) => {
  edits.value = { ...edits.value, [playerId]: { ...editOf(playerId), ...patch } };
};

async function runCommand(path: string, init: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}, success?: string) {
  try {
    await sendAdminCommand(path, init);
    if (success) toast.success(success);
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    return false;
  }
}

async function savePlayer(playerId: number) {
  const confirmed = await confirmAction({
    title: "保存玩家资料",
    content: `确认保存对玩家 ${playerName(playerId)} 的修改？`,
    positiveText: "保存",
    negativeText: "取消",
  });
  if (!confirmed) return;
  void runCommand(`/api/admin/players/${playerId}`, { method: "PATCH", body: editOf(playerId) }, "玩家资料已保存。");
}

async function unlink(playerId: number, name: string) {
  const confirmed = await confirmAction({
    title: "解除认领",
    content: `确认解除「${name}」与登录账户的认领关系？`,
    positiveText: "解除",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void runCommand(`/api/admin/players/${playerId}/unlink`, {}, "已解除认领。");
}

async function removePlayer(playerId: number, name: string) {
  const confirmed = await confirmAction({
    title: "移入回收站",
    content: `确认将玩家「${name}」移入回收站？关联登录账户将解绑，恢复档案后需重新认领。`,
    positiveText: "移入回收站",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void runCommand("/api/admin/trash", { body: { kind: "player", targetId: playerId } }, "玩家已移入回收站并解除认领。");
}

async function createPlayer() {
  if (!newPlayer.value.bilibiliUid.trim() && !newPlayer.value.name.trim()) {
    toast.error("请填写 B 站 UID，或者至少给一个显示名。");
    return;
  }
  const ok = await runCommand("/api/admin/players", {
    body: { name: newPlayer.value.name.trim(), bilibiliUid: newPlayer.value.bilibiliUid.trim() },
  }, "玩家已建档。");
  if (ok) { newPlayer.value = { name: "", bilibiliUid: "" }; creating.value = false; }
}

const reviewClaim = (requestId: number, status: "approved" | "rejected") =>
  runCommand(`/api/admin/player-claims/${requestId}`, { body: { status } },
    status === "approved" ? "已建档并认领。" : "申请已驳回。");

/** 一个玩家名下的全部记录：目录里的公开记录 + 审核队列里非拒绝的那些。 */
function completionsOf(playerId: number) {
  const trash = adminTrash.data.value;
  const fromCatalog = catalog.value.submissions
    .filter((item) => item.playerId === playerId && !isRecordTrashed(trash, item.id))
    .map((item) => ({
      id: item.id,
      challengeId: item.challengeId,
      hidden: false,
      tags: (item.tags || []).map((text, index) => ({ id: item.id * 1000 + index, kind: "badge" as const, text, color: "#67c9ff" })),
    }));
  const fromQueue = props.records
    .filter((item) => item.playerId === playerId && item.status !== "rejected" && !isRecordTrashed(trash, item.id))
    .map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? 0,
      hidden: item.status === "hidden",
      tags: item.reviewTags || [],
    }));
  return [...fromCatalog, ...fromQueue];
}

async function changeTags(recordId: number, tags: ReviewTag[]) {
  const { ok, data } = await api.patch(`/api/admin/submissions/${recordId}`, { reviewTags: tags });
  if (!ok) { toast.error(data.error || "记录保存失败。"); return; }
  await applyEffects("/api/admin/submissions");
}
const appendTag = async (recordId: number, tag: Omit<ReviewTag, "id">) => {
  await runCommand(`/api/admin/submissions/${recordId}/tags`, { body: tag }, "标签已追加。");
  return true;
};

async function softDeleteRecord(recordId: number, label: string) {
  const confirmed = await confirmAction({
    title: "移入回收站",
    content: `确认将「${label}」移入回收站？`,
    positiveText: "移入回收站",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void runCommand("/api/admin/trash", { body: { kind: "record", targetId: recordId } }, "已移入回收站。");
}
</script>

<template>
  <div class="adm-section">
    <AdminPlayerBindingPanel />

    <!-- 折叠着放：玩家页主要是查和改，建档是偶尔为之，不该常占列表上方。 -->
    <PanelBlock title="新建玩家" subtitle="不经过认领申请，直接建档一个已知身份的玩家，例如补录历史记录时用到的玩家。">
      <template #actions>
        <NButton size="small" @click="creating = !creating">{{ creating ? "收起" : "建一个" }}</NButton>
      </template>
      <div v-if="creating" class="adm-form">
        <FormField label="B 站 UID" hint="支持多个数字 UID 或主页链接，用逗号分隔；昵称取第一个 ID">
          <NInput v-model:value="newPlayer.bilibiliUid" />
        </FormField>
        <FormField label="显示名" hint="留空用抓到的 B 站昵称；抓不到时才需要手填">
          <NInput v-model:value="newPlayer.name" />
        </FormField>
        <div class="adm-actions adm-form-wide">
          <NButton type="primary" @click="createPlayer">建档</NButton>
        </div>
      </div>
      <p v-else class="adm-empty">点「建一个」展开表单。</p>
    </PanelBlock>

    <PanelBlock
      v-if="pendingClaims.length"
      title="新身份申请"
      subtitle="旧申请需要申请人重新生成绑定码，核对专栏评论后在上方接受绑定码。"
    >
      <div class="adm-section">
        <article v-for="request in pendingClaims" :key="request.id" class="player-card">
          <header class="player-head">
            <span class="player-who">
              <a :href="`https://space.bilibili.com/${request.bilibiliUid}`" target="_blank" rel="noreferrer">{{ request.bilibiliName }}</a>
              <b class="uid">UID {{ request.bilibiliUid }}</b>
            </span>
            <span v-if="request.nameSource === 'manual'" class="adm-state">昵称为用户手填</span>
          </header>
          <div class="player-body">
            <p class="adm-row-time">申请人：{{ request.accountName }}{{ request.accountEmail ? `（${request.accountEmail}）` : "" }}</p>
            <div class="adm-actions">
              <NButton size="small" type="error" @click="reviewClaim(request.id, 'rejected')">驳回</NButton>
            </div>
          </div>
        </article>
      </div>
    </PanelBlock>

    <div class="adm-section">
      <article v-for="player in paged" :key="player.id" class="player-card">
        <header class="player-head">
          <span class="player-who">
            <RouterLink :to="`/player/${player.id}`">{{ player.name }}</RouterLink>
          </span>
          <span class="adm-state" :class="`adm-state-${editOf(player.id).status}`">{{ statusLabels[editOf(player.id).status] }}</span>
          <NButton size="small" @click="expanded = expanded === player.id ? null : player.id">详情</NButton>
        </header>

        <div v-if="expanded === player.id" class="player-body">
          <div class="player-private">
            <span>{{ playerBilibiliUids(player).length ? `B站 UID：${playerBilibiliUids(player).join("、")}` : "B站 UID：未录入" }}</span>
            <a v-if="player.bilibiliUrl" :href="player.bilibiliUrl" target="_blank" rel="noreferrer">B站主页 ↗</a>
          </div>

          <h3 class="sub-title">已完成挑战</h3>
          <div class="completions">
            <div
              v-for="record in completionsOf(player.id)"
              :key="record.id"
              class="completion"
              :class="{ 'completion-hidden': record.hidden }"
            >
              <RouterLink :to="`/record/${record.id}`">{{ challengeContext(record.challengeId).label }}</RouterLink>
              <div class="completion-actions">
                <NButton size="small" quaternary @click="editingCompletion = editingCompletion === record.id ? null : record.id">更改标记</NButton>
                <NButton size="small" type="error" @click="softDeleteRecord(record.id, `${player.name} · ${challengeContext(record.challengeId).label}`)">删除</NButton>
              </div>
              <div v-if="editingCompletion === record.id" class="completion-tags">
                <AdminTagEditor
                  :tags="record.tags"
                  :on-change="(next: ReviewTag[]) => changeTags(record.id, next)"
                  :on-append="(tag: Omit<ReviewTag, 'id'>) => appendTag(record.id, tag)"
                />
              </div>
            </div>
            <p v-if="!completionsOf(player.id).length" class="adm-empty">暂无记录</p>
          </div>

          <div class="edit-grid">
            <FormField label="B 站 UID" hint="每行一个或用逗号分隔；头像取第一个 ID，直播按顺序取首个开播房间；留空解除全部绑定">
              <NInput
                :value="editOf(player.id).bilibiliUids"
                type="textarea"
                :rows="3"
                @update:value="(value: string) => setEdit(player.id, { bilibiliUids: value })"
              />
            </FormField>
            <FormField label="显示名">
              <NInput :value="editOf(player.id).displayName" @update:value="(value: string) => setEdit(player.id, { displayName: value })" />
            </FormField>
            <FormField label="玩家状态">
              <NSelect
                :value="editOf(player.id).status"
                :options="statusOptions"
                @update:value="(value: PlayerStatus) => setEdit(player.id, { status: value })"
              />
            </FormField>
            <FormField label="绑定邮箱" hint="由玩家账户维护，后台不可改">
              <NInput :value="directory.contacts[String(player.id)]?.email || '未绑定'" readonly />
            </FormField>
            <FormField label="绑定 QQ" hint="由玩家账户维护，后台不可改">
              <NInput :value="directory.contacts[String(player.id)]?.qqLinked ? '已绑定' : '未绑定'" readonly />
            </FormField>
          </div>

          <div class="adm-actions">
            <NButton type="primary" @click="savePlayer(player.id)">确认并保存</NButton>
            <NButton v-if="directory.contacts[String(player.id)]" @click="unlink(player.id, player.name)">解除认领</NButton>
            <NButton type="error" @click="removePlayer(player.id, player.name)">删除玩家档案</NButton>
          </div>
        </div>
      </article>
    </div>

    <AdminPager v-model:page="page" :item-count="filtered.length" :page-size="PAGE_SIZE" />
  </div>
</template>

<style scoped>
.player-card { background: var(--bg-inset); border-radius: var(--r-md); overflow: hidden; }
.player-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
}
.player-who { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; min-width: 0; }
.player-who a { font-size: var(--fs-body); font-weight: var(--fw-medium); }
.uid {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-sm);
  font-weight: var(--fw-normal);
  color: var(--fg-subtle);
}
.player-body { display: grid; gap: var(--sp-4); padding: var(--sp-4); border-top: var(--hairline); }
.player-private { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-sm); color: var(--fg-muted); }
.sub-title { margin: 0; font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }

.completions { display: grid; gap: var(--sp-2); max-height: 420px; overflow-y: auto; overscroll-behavior: contain; }
.completion {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface);
  border-radius: var(--r-sm);
}
/* 已隐藏的完成记录仍要能读，只是退到后面。 */
.completion-hidden { opacity: .55; }
.completion-actions { display: flex; gap: var(--sp-2); }
.completion-tags { grid-column: 1 / -1; }
.edit-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-4); }

@media (max-width: 900px) {
  .player-head { grid-template-columns: 1fr; }
}
</style>
