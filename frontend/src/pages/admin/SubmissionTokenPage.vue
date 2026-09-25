<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { NAlert, NButton, NEmpty, NList, NListItem, NSpace, NText } from "naive-ui";
import { api } from "@/lib/api";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";

type TokenInfo = { id: number; createdAt: string; expiresAt: string; revokedAt: string | null };
const session = useSessionStore();
const loading = ref(true), busy = ref(false), installed = ref(false);
const error = ref(""), tokens = ref<TokenInfo[]>([]);
async function loadTokens() {
  const result = await api.get<{ tokens: TokenInfo[] }>("/api/admin/submission-token");
  if (result.ok) tokens.value = result.data.tokens.filter(item => !item.revokedAt);
  else error.value = result.data.error || "无法读取授权。";
}
async function revoke(id: number) {
  busy.value = true; error.value = "";
  const result = await api.delete("/api/admin/submission-token", { id });
  if (result.ok) { installed.value = false; await loadTokens(); }
  else error.value = result.data.error || "撤销失败。";
  busy.value = false;
}
function authorize() {
  // 真实点击由新版油猴处理：同源签发后直接写入 GM 存储，网页不传递凭据。
  if (document.documentElement.getAttribute("data-cngoldenclip-ready") !== "2") {
    error.value = "未检测到新版金榜速录，请更新油猴脚本后刷新页面。";
  }
}
function authState() {
  const root = document.documentElement;
  const state = root.getAttribute("data-cngoldenclip-auth-state");
  busy.value = state === "pending";
  installed.value = state === "success";
  error.value = state === "error" ? root.getAttribute("data-cngoldenclip-auth-error") || "授权失败，请重试。" : "";
  if (state === "success" || state === "error") void loadTokens();
}
onMounted(async () => {
  window.addEventListener("cngoldenclip-auth-state", authState);
  await session.refresh();
  loading.value = false;
  if (session.isAdmin) await loadTokens();
});
onBeforeUnmount(() => window.removeEventListener("cngoldenclip-auth-state", authState));
</script>

<template>
  <PageShell title="金榜速录授权" lede="请点击一键授权，完成后关闭本页，返回 B 站再次点击添加到金榜。">
    <PanelBlock>
      <p v-if="loading">正在检查权限…</p>
      <NAlert v-else-if="!session.isAdmin" type="warning">权限不足：仅管理员可授权，请先登录管理员账号。</NAlert>
      <NSpace v-else vertical size="large">
        <NSpace><NButton type="primary" :loading="busy" :disabled="busy" data-cngoldenclip-authorize @click="authorize">一键授权</NButton></NSpace>
        <NAlert v-if="installed" type="success" role="status">授权成功，可以关闭本页，返回 B 站继续录入。</NAlert>
        <NAlert v-if="error" type="error" role="alert">{{ error }}</NAlert>
      </NSpace>
    </PanelBlock>
    <PanelBlock v-if="!loading && session.isAdmin" title="我的授权">
      <NEmpty v-if="!tokens.length" description="暂无授权" />
      <NList v-else>
        <NListItem v-for="item in tokens" :key="item.id">
          <NSpace vertical size="small">
            <NText>#{{ item.id }} · {{ new Date(item.createdAt).toLocaleString() }}</NText>
            <NText depth="3">{{ Date.parse(item.expiresAt) <= Date.now() ? '已过期' : `有效期至 ${new Date(item.expiresAt).toLocaleDateString()}` }}</NText>
          </NSpace>
          <template #suffix><NButton size="small" :disabled="busy" @click="revoke(item.id)">撤销</NButton></template>
        </NListItem>
      </NList>
    </PanelBlock>
  </PageShell>
</template>
