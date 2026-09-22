<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { NButton, NInput } from "naive-ui";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-resources";
import AdminPager from "@/components/admin/AdminPager.vue";
import PanelBlock from "@/components/PanelBlock.vue";

type Player = { id: number; name: string; disabled: boolean; points: number; configuredPoints: number };
const players = ref<Player[]>([]);
const search = ref("");
const busy = ref(false);
const error = ref("");
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const query = ref("");
let searchTimer: ReturnType<typeof setTimeout>;
let requestId = 0;
watch(search, value => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; query.value = value.trim(); }, 250);
});
onBeforeUnmount(() => { clearTimeout(searchTimer); requestId++; });
watch([page, query], () => void load(), { immediate: true });
async function load() {
  const id = ++requestId;
  loading.value = true; error.value = "";
  const params = new URLSearchParams({ page: String(page.value), q: query.value });
  const result = await api.get<{ data?: { players: Player[]; total: number } }>(`/api/admin/ping-permissions?${params}`);
  if (id !== requestId) return;
  loading.value = false;
  if (result.ok && result.data.data) {
    players.value = result.data.data.players;
    total.value = result.data.data.total;
    page.value = Math.min(page.value, Math.max(1, Math.ceil(total.value / 20)));
  } else error.value = result.data.error || "加载失败。";
}
async function toggle(player: Player) {
  busy.value = true; error.value = "";
  try {
    await sendAdminCommand("/api/admin/ping-permissions", { body: { playerId: player.id, disabled: !player.disabled } });
    await load();
  } catch (e) { error.value = e instanceof Error ? e.message : "保存失败。"; }
  finally { busy.value = false; }
}

</script>
<template>
  <PanelBlock title="Ping 点管理">
    <p class="hint">玩家可在愿望单的 CCT 区域为 Tier 7 及以上难度的挑战设置 Ping 点。带金到达时，机器人向所有已配置推送的群发送提醒。管理员可对滥用此功能的玩家禁用 Ping 点。</p>
    <NInput v-model:value="search" placeholder="搜索玩家名称或 ID" aria-label="搜索玩家" clearable />
    <p v-if="error" class="adm-warn" role="alert">{{ error }}</p>
    <p v-if="loading" class="hint" role="status">加载中…</p>
    <p v-else-if="!players.length && !error" class="hint">{{ query ? "没有符合条件的玩家。" : "暂无玩家设置 Ping 点。" }}</p>
    <div v-for="player in players" :key="player.id" class="player">
      <span>{{ player.name }} · {{ player.points }} 个已激活 / {{ player.configuredPoints }} 个已设置 · {{ player.disabled ? '已禁用' : '已启用' }}</span>
      <NButton size="small" :type="player.disabled ? 'default' : 'error'" :disabled="busy || loading" @click="toggle(player)">{{ player.disabled ? '恢复功能' : '禁用功能' }}</NButton>
    </div>
    <AdminPager v-model:page="page" :item-count="total" :page-size="20" />
  </PanelBlock>
</template>
<style scoped>
.hint { font-size: var(--fs-sm); color: var(--fg-secondary); line-height: var(--lh-body); }
.player { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3) 0; border-bottom: var(--hairline); font-size: var(--fs-sm); }
</style>
