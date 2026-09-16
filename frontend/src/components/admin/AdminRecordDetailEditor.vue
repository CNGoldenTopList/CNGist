<script setup lang="ts">
/** 记录详情页上的管理编辑。改动会写入审计日志；删除是移入回收站，不是永久删除。 */
import { ref, watch } from "vue";
import { NButton, NDatePicker, NInput } from "naive-ui";
import { storeToRefs } from "pinia";
import { toBeijingStorage, toDateTimeInput } from "@shared/datetime";
import type { ReviewTag } from "@shared/admin";
import { api } from "@/lib/api";
import { applyEffects, sendAdminCommand } from "@/lib/admin-resources";
import { useSessionStore } from "@/stores/session";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import AdminTagEditor from "@/components/admin/AdminTagEditor.vue";

type EditableRecord = {
  id: number; label: string; returnHref: string;
  videoUrl?: string; rawVideoUrl?: string; playerNote?: string; verifierNote?: string;
  achievedAt?: string; reviewedAt?: string; duration?: string;
  tags: ReviewTag[]; adminManaged: boolean;
};

const props = defineProps<{ record: EditableRecord }>();
const emit = defineEmits<{ saved: [] }>();

const { isAdmin, adminMode } = storeToRefs(useSessionStore());

const open = ref(false);
const videoUrl = ref("");
const rawVideoUrl = ref("");
const playerNote = ref("");
const verifierNote = ref("");
const achievedAt = ref<number | null>(null);
const reviewedAt = ref<number | null>(null);
const duration = ref("");
const tags = ref<ReviewTag[]>([]);
/* reviewTags 是整份覆盖写：只有管理员真的动过标签才发它。否则「改个视频链接
   顺手保存」会把这条记录的标签替换成表单里那一份 —— 而那一份在标签还没读进来
   时是空的，一保存旧标签就没了。 */
const tagsTouched = ref(false);
const confirmDelete = ref(false);
const saving = ref(false);
const error = ref("");

const stampOf = (value?: string) => {
  const input = toDateTimeInput(value);
  return input ? new Date(`${input}:00+08:00`).getTime() : null;
};
const storageOf = (value: number | null) => {
  if (!value) return "";
  return new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 16);
};

watch(() => props.record, (record) => {
  videoUrl.value = record.videoUrl || "";
  rawVideoUrl.value = record.rawVideoUrl || "";
  playerNote.value = record.playerNote || "";
  verifierNote.value = record.verifierNote || "";
  achievedAt.value = stampOf(record.achievedAt);
  reviewedAt.value = stampOf(record.reviewedAt);
  duration.value = record.duration || "";
  tags.value = record.tags;
  tagsTouched.value = false;
}, { immediate: true, deep: true });

async function save() {
  if (!videoUrl.value.trim()) { error.value = "挑战视频链接不能为空。"; return; }
  saving.value = true;
  error.value = "";
  const { ok, data } = await api.patch(`/api/admin/submissions/${props.record.id}`, {
    videoUrl: videoUrl.value.trim(),
    rawVideoUrl: rawVideoUrl.value.trim() || null,
    achievedAt: toBeijingStorage(storageOf(achievedAt.value)),
    reviewedAt: reviewedAt.value ? toBeijingStorage(storageOf(reviewedAt.value)) : null,
    duration: duration.value || null,
    playerNote: playerNote.value || null,
    verifierNote: verifierNote.value || null,
    ...(tagsTouched.value ? { reviewTags: tags.value } : {}),
  });
  saving.value = false;
  if (!ok) { error.value = data.error || "保存失败，请稍后重试。"; return; }
  await applyEffects("/api/admin/submissions");
  emit("saved");
}

async function remove() {
  saving.value = true;
  try {
    await sendAdminCommand("/api/admin/trash", { body: { kind: "record", targetId: props.record.id } });
    window.location.assign(props.record.returnHref);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除失败，请稍后重试。";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PanelBlock v-if="isAdmin && adminMode" title="管理编辑" subtitle="改动会写入审计日志。删除是移入回收站，不是永久删除。">
    <template #actions>
      <NButton size="small" @click="open = !open">{{ open ? "收起" : "编辑记录" }}</NButton>
      <template v-if="confirmDelete">
        <NButton size="small" type="error" :loading="saving" @click="remove">确定移入回收站</NButton>
        <NButton size="small" quaternary @click="confirmDelete = false">取消</NButton>
      </template>
      <NButton v-else size="small" type="error" @click="confirmDelete = true">删除记录</NButton>
    </template>

    <div v-if="open" class="editor">
      <div class="adm-form">
        <FormField label="挑战视频链接" required wide>
          <NInput v-model:value="videoUrl" placeholder="https://" />
        </FormField>
        <FormField label="未剪辑录像（RAW）" hint="留空表示没有，会清空该字段" wide>
          <NInput v-model:value="rawVideoUrl" placeholder="https://" />
        </FormField>
        <FormField label="达成时间" hint="北京时间">
          <NDatePicker to="body" v-model:value="achievedAt" type="datetime" class="full" />
        </FormField>
        <FormField label="审核时间" hint="北京时间">
          <NDatePicker to="body" v-model:value="reviewedAt" type="datetime" clearable class="full" />
        </FormField>
        <FormField label="总用时">
          <NInput v-model:value="duration" placeholder="例如 01:23:45" />
        </FormField>
        <FormField label="玩家备注" wide>
          <NInput v-model:value="playerNote" type="textarea" :rows="3" />
        </FormField>
        <FormField label="验证者备注" wide>
          <NInput v-model:value="verifierNote" type="textarea" :rows="3" />
        </FormField>
      </div>

      <section class="adm-section">
        <h3 class="section-title">标签</h3>
        <AdminTagEditor :tags="tags" :on-change="(next: ReviewTag[]) => { tagsTouched = true; tags = next; }" />
      </section>

      <div class="adm-actions end">
        <NButton type="primary" :loading="saving" @click="save">保存记录修改</NButton>
      </div>
      <p v-if="error" class="adm-warn" role="status">{{ error }}</p>
    </div>
    <p v-else class="adm-empty">点「编辑记录」展开表单。</p>
  </PanelBlock>
</template>

<style scoped>
.editor { display: grid; gap: var(--sp-5); }
.section-title {
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.end { justify-content: flex-end; }
.full { width: 100%; }
</style>
