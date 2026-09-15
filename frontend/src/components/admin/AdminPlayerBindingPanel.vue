<script setup lang="ts">
/**
 * 人工接受绑定码。
 *
 * 光有绑定码不足以证明身份 —— 必须点开发评论的那个用户主页，确认 UID 与昵称
 * 都一致。所以这里是「查询 → 弹窗核对 → 勾选确认 → 完成认领」四步，勾选框
 * 不勾不给点确认。
 */
import { onMounted, ref } from "vue";
import { NButton, NCheckbox, NInput, NModal } from "naive-ui";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import FormField from "@/components/FormField.vue";
import PanelBlock from "@/components/PanelBlock.vue";

type BindingPayload = { id: number; code: string; bilibiliUid: string; bilibiliName: string };

const code = ref("");
const articleUrl = ref<string | null>(null);
const preview = ref<BindingPayload | null>(null);
const confirmed = ref(false);
const busy = ref(false);

onMounted(async () => {
  const { ok, data } = await api.get<{ articleUrl?: string | null }>("/api/admin/player-bindings/preview");
  if (ok) articleUrl.value = data.articleUrl ?? null;
});

async function inspect() {
  busy.value = true;
  const { ok, data } = await api.post<{ data?: BindingPayload }>("/api/admin/player-bindings/preview", { code: code.value });
  busy.value = false;
  if (!ok || !data.data) { toast.error(data.error ?? "查询失败。"); return; }
  confirmed.value = false;
  preview.value = data.data;
}

async function accept() {
  const target = preview.value;
  if (!target || !confirmed.value) return;
  busy.value = true;
  try {
    await sendAdminCommand("/api/admin/player-bindings", {
      body: { id: target.id, uid: target.bilibiliUid, name: target.bilibiliName, confirmed: true },
    });
    preview.value = null;
    code.value = "";
    toast.success("绑定码已接受，认领完成。");
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "请求失败，请重新查询绑定码确认结果。");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PanelBlock title="接受绑定码" subtitle="从绑定专栏评论中复制绑定码，查询后核对评论者身份。">
    <div class="adm-section">
      <a v-if="articleUrl" :href="articleUrl" target="_blank" rel="noreferrer">打开绑定专栏 ↗</a>
      <p v-else class="adm-warn">尚未配置绑定专栏地址，暂不能人工接受绑定码。</p>
      <FormField label="绑定码">
        <NInput
          :value="code"
          placeholder="AB12-CD34"
          :maxlength="9"
          :disabled="busy"
          class="code-input"
          @update:value="(value: string) => code = value.toUpperCase()"
        />
      </FormField>
      <div class="adm-actions">
        <NButton :disabled="busy || !code.trim() || !articleUrl" :loading="busy" @click="inspect">查询并核对</NButton>
      </div>
    </div>

    <NModal
      :show="Boolean(preview)"
      preset="card"
      title="确认评论者身份"
      :bordered="false"
      style="max-width: 520px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value && !busy) preview = null; }"
    >
      <div v-if="preview" class="adm-section">
        <p>绑定码：<strong>{{ preview.code }}</strong></p>
        <p>B 站 UID：<strong>{{ preview.bilibiliUid }}</strong></p>
        <p>B 站昵称：<strong>{{ preview.bilibiliName }}</strong>（生成绑定码时获取）</p>
        <a :href="`https://space.bilibili.com/${preview.bilibiliUid}`" target="_blank" rel="noreferrer">打开目标 B 站主页 ↗</a>
        <a v-if="articleUrl" :href="articleUrl" target="_blank" rel="noreferrer">打开专栏核对评论 ↗</a>
        <p class="warn-text">请点开发布这条绑定码评论的用户主页，确认 UID 和昵称均与上面一致。仅绑定码相同不足以证明身份。</p>
        <NCheckbox v-model:checked="confirmed" :disabled="busy">我已核对评论者的 UID 和昵称，两项都一致</NCheckbox>
      </div>
      <template #footer>
        <div class="foot">
          <NButton :disabled="busy" @click="preview = null">取消</NButton>
          <NButton type="primary" :disabled="!confirmed || busy" :loading="busy" @click="accept">确认一致，完成认领</NButton>
        </div>
      </template>
    </NModal>
  </PanelBlock>
</template>

<style scoped>
.code-input { max-width: 200px; }
.adm-section p { margin: 0; font-size: var(--fs-body); color: var(--fg-secondary); }
.adm-section strong { color: var(--fg-default); font-family: var(--font-num); }
/* 提高一级特异度盖住上面那条后代规则，而不是用 !important —— 全站零 !important。 */
.adm-section p.warn-text { font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--danger-400); }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
