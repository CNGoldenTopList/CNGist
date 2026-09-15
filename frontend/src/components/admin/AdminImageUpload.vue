<script setup lang="ts">
/**
 * 展示图上传。先传到 OSS 拿 objectKey，再随资料一起保存。
 *
 * 保存的是 objectKey，不是 url —— url 只用于本页预览，CDN 域名换了之后
 * 存进库的那一份就失效了。也不存 data URL：那会让一张封面把整行记录撑到几百 KB。
 */
import { ref } from "vue";
import { NButton, NUpload } from "naive-ui";
import type { UploadCustomRequestOptions } from "naive-ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/feedback";
import FormField from "@/components/FormField.vue";

/** 写进目录的值。 */
const objectKey = defineModel<string>({ required: true });
/** 仅本页预览用；换图前保持原图的展示地址。 */
const previewUrl = defineModel<string>("preview", { default: "" });

const busy = ref(false);

async function upload({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const raw = file.file;
  if (!raw) { onError(); return; }
  busy.value = true;
  const form = new FormData();
  form.append("file", raw);
  const { ok, data } = await api.upload<{ data?: { objectKey: string; url: string } }>("/api/admin/assets", form);
  busy.value = false;
  if (!ok || !data.data) {
    toast.error(data.error || "图片上传失败。");
    onError();
    return;
  }
  objectKey.value = data.data.objectKey;
  previewUrl.value = data.data.url;
  onFinish();
}
</script>

<template>
  <FormField label="展示图" hint="保存的是对象索引；换了 CDN 域名也不用重传">
    <div class="upload">
      <NUpload accept="image/*" :show-file-list="false" :custom-request="upload" :disabled="busy">
        <NButton :loading="busy">选择图片</NButton>
      </NUpload>
      <span v-if="previewUrl || objectKey" class="preview">
        <img v-if="previewUrl" :src="previewUrl" alt="展示图预览" />
        <code v-else class="key">{{ objectKey }}</code>
        <NButton size="small" quaternary @click="objectKey = ''; previewUrl = ''">移除图片</NButton>
      </span>
    </div>
  </FormField>
</template>

<style scoped>
.upload { display: grid; gap: var(--sp-2); }
.preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
}
.preview img { width: 100%; height: 88px; object-fit: cover; border-radius: var(--r-sm); }
.key { font-family: var(--font-num); font-size: var(--fs-micro); color: var(--fg-subtle); overflow-wrap: anywhere; }
</style>
