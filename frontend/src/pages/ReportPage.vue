<script setup lang="ts">
/** 反馈问题。写入反馈表，管理员在「待处理」里看到。匿名也能提交，但配图需要登录。 */
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { NButton, NInput, NUpload } from "naive-ui";
import type { UploadCustomRequestOptions } from "naive-ui";
import { storeToRefs } from "pinia";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";

type Attachment = { id: number; url: string; bytes: number };

const MAX_ATTACHMENTS = 4;
const MAX_BYTES = 5 * 1024 * 1024;

const { t, apiError } = useLanguage();
const route = useRoute();
const { account } = storeToRefs(useSessionStore());

const title = ref("");
const detail = ref("");
const pageUrl = ref("");
const attachments = ref<Attachment[]>([]);
const uploading = ref(false);
const submitting = ref(false);
const attempted = ref(false);
const done = ref(false);
const error = ref("");

const errors = computed(() => ({
  title: !title.value.trim() ? t("common.required") : undefined,
  detail: !detail.value.trim() ? t("common.required") : undefined,
}));
const show = (key: "title" | "detail") => (attempted.value ? errors.value[key] : undefined);

/** 选中即上传：拿到的 id 才是提交时认的凭据，页面上不保留文件本身。 */
async function upload({ file, onFinish, onError }: UploadCustomRequestOptions) {
  error.value = "";
  if (attachments.value.length >= MAX_ATTACHMENTS) {
    error.value = t("report.tooMany", { count: MAX_ATTACHMENTS });
    onError();
    return;
  }
  const raw = file.file;
  if (!raw) { onError(); return; }
  if (raw.size > MAX_BYTES) {
    error.value = t("report.tooLarge", { name: raw.name, size: MAX_BYTES / 1024 / 1024 });
    onError();
    return;
  }
  uploading.value = true;
  const form = new FormData();
  form.append("file", raw);
  const { ok, data } = await api.upload<{ attachment?: Attachment }>("/api/feedback/attachments", form);
  uploading.value = false;
  if (!ok || !data.attachment) {
    error.value = data.code ? apiError(data) : t("report.uploadFailed", { name: raw.name });
    onError();
    return;
  }
  attachments.value = [...attachments.value, data.attachment];
  done.value = false;
  onFinish();
}

async function removeAttachment(id: number) {
  attachments.value = attachments.value.filter((item) => item.id !== id);
  await api.delete(`/api/feedback/attachments?id=${id}`);
}

async function submit() {
  attempted.value = true;
  error.value = "";
  if (errors.value.title || errors.value.detail) return;
  submitting.value = true;
  const { ok, data } = await api.post("/api/feedback", {
    title: title.value.trim(),
    detail: detail.value.trim(),
    pageUrl: pageUrl.value.trim() || route.fullPath,
    attachmentIds: attachments.value.map((item) => item.id),
  });
  submitting.value = false;
  if (!ok) { error.value = apiError(data, "report.failed"); return; }
  title.value = "";
  detail.value = "";
  pageUrl.value = "";
  attachments.value = [];
  attempted.value = false;
  done.value = true;
}
</script>

<template>
  <PageShell :eyebrow="t('home.report')" :title="t('report.title')" :lede="t('report.lede')">
    <PanelBlock :title="t('report.section')">
      <div class="form">
        <FormField :label="t('report.titleField')" :error="show('title')" required wide>
          <NInput
            v-model:value="title"
            :placeholder="t('report.titlePlaceholder')"
            :status="show('title') ? 'error' : undefined"
            @update:value="done = false"
          />
        </FormField>
        <FormField :label="t('report.page')" :hint="t('report.pageHint')" wide>
          <NInput v-model:value="pageUrl" :placeholder="t('report.pagePlaceholder')" />
        </FormField>
        <FormField :label="t('report.detail')" :error="show('detail')" required wide>
          <NInput
            v-model:value="detail"
            type="textarea"
            :rows="8"
            :status="show('detail') ? 'error' : undefined"
            @update:value="done = false"
          />
        </FormField>
        <FormField
          :label="t('report.screenshots')"
          :hint="t('report.screenshotHint', { count: MAX_ATTACHMENTS, size: MAX_BYTES / 1024 / 1024 })"
          wide
        >
          <div v-if="account" class="upload">
            <NUpload
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              :show-file-list="false"
              :disabled="uploading || attachments.length >= MAX_ATTACHMENTS"
              :custom-request="upload"
            >
              <NButton :loading="uploading" :disabled="attachments.length >= MAX_ATTACHMENTS">{{ t("report.screenshots") }}</NButton>
            </NUpload>
            <ul v-if="attachments.length" class="thumbs">
              <li v-for="item in attachments" :key="item.id" class="thumb">
                <img :src="item.url" :alt="t('report.screenshotAlt')" />
                <span class="thumb-size">{{ (item.bytes / 1024).toFixed(0) }} KB</span>
                <NButton size="tiny" quaternary @click="removeAttachment(item.id)">{{ t("common.remove") }}</NButton>
              </li>
            </ul>
          </div>
          <p v-else class="upload-hint">{{ t("report.loginForScreenshots") }}</p>
        </FormField>
      </div>
    </PanelBlock>

    <div class="actions">
      <NButton size="large" type="primary" :loading="submitting" @click="submit">{{ t("report.submit") }}</NButton>
      <p v-if="done" class="success" role="status">{{ t("report.submitted") }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </PageShell>
</template>

<style scoped>
.form { display: grid; gap: var(--sp-5); }
.actions { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; padding-top: var(--sp-5); border-top: var(--hairline); }
.success { margin: 0; font-size: var(--fs-body); color: var(--accent-300); }
.error { margin: 0; font-size: var(--fs-body); color: var(--danger-400); }

.upload { display: grid; gap: var(--sp-3); }
.thumbs { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }
.thumb { display: grid; gap: var(--sp-1); justify-items: center; }
.thumb img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--r-sm);
  border: var(--hairline);
  background: var(--bg-inset);
}
.thumb-size { font-size: var(--fs-micro); color: var(--fg-muted); }
.upload-hint { margin: 0; font-size: var(--fs-sm); color: var(--fg-muted); }

@media (max-width: 640px) {
  .actions > :first-child { width: 100%; }
}
</style>
