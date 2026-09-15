<script setup lang="ts">
/** 管理员任免。只有超级管理员看得到这一页；超级管理员本身不可在这里改。 */
import { onMounted, ref } from "vue";
import { NButton, NInput } from "naive-ui";
import type { AccountRole } from "@shared/account-roles";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-resources";
import { confirmAction, toast } from "@/lib/feedback";
import FormField from "@/components/FormField.vue";

type ManagedAccount = { id: number; displayName: string; email: string | null; role: AccountRole; status: string };
const labels: Record<AccountRole, string> = { player: "玩家", admin: "普通管理员", super_admin: "超级管理员" };

const query = ref("");
const accounts = ref<ManagedAccount[]>([]);
const busy = ref(true);
const error = ref("");

async function load() {
  busy.value = true;
  error.value = "";
  const { ok, data } = await api.get<{ data?: ManagedAccount[] }>(`/api/admin/accounts?q=${encodeURIComponent(query.value)}`);
  busy.value = false;
  if (!ok) { accounts.value = []; error.value = data.error || "读取失败。"; return; }
  accounts.value = data.data ?? [];
}

onMounted(load);

async function changeRole(target: ManagedAccount) {
  const role = target.role === "admin" ? "player" : "admin";
  const action = role === "admin" ? "任命为普通管理员" : "撤销普通管理员权限";
  const confirmed = await confirmAction({
    title: "修改管理权限",
    content: `确认对「${target.displayName}」（#${target.id}）${action}？`,
    positiveText: "确认",
    negativeText: "取消",
    danger: role === "player",
  });
  if (!confirmed) return;
  busy.value = true;
  error.value = "";
  try {
    await sendAdminCommand(`/api/admin/accounts/${target.id}/role`, { method: "PATCH", body: { role } });
    toast.success("权限已更新。");
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "操作失败。";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="adm-section" aria-label="管理员权限">
    <form class="adm-form" @submit.prevent="load">
      <FormField label="查找账户" hint="留空显示管理员；支持显示名、邮箱或账户 ID，每次最多显示 50 条。" wide>
        <NInput v-model:value="query" :disabled="busy" :maxlength="200" />
      </FormField>
      <NButton attr-type="submit" :loading="busy">查询</NButton>
    </form>

    <p v-if="error" class="adm-warn" role="alert">{{ error }}</p>

    <ul class="adm-list">
      <li v-for="target in accounts" :key="target.id" class="adm-row">
        <div class="adm-row-main">
          <span class="adm-row-title">{{ target.displayName }} · {{ labels[target.role] }}</span>
          <span class="adm-row-time">{{ target.email || "未设置邮箱" }} · {{ target.status === "active" ? "正常" : "已停用" }}</span>
          <span class="adm-row-time">#{{ target.id }}</span>
        </div>
        <NButton
          v-if="target.role !== 'super_admin'"
          size="small"
          :type="target.role === 'admin' ? 'error' : 'default'"
          :disabled="busy || (target.role === 'player' && target.status !== 'active')"
          @click="changeRole(target)"
        >{{ target.role === "admin" ? "撤销管理员" : "设为管理员" }}</NButton>
      </li>
    </ul>
    <p v-if="!busy && !error && !accounts.length" class="adm-empty">没有匹配的账户。</p>
  </section>
</template>
