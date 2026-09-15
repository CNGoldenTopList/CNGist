<script setup lang="ts">
/** 删除意见。就地二次确认：删了连投票和评论一起没，已完成列表也不再显示。 */
import { ref } from "vue";
import { NButton } from "naive-ui";
import type { Suggestion } from "@shared/types";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";

const props = defineProps<{ item: Suggestion; disabled?: boolean }>();

const confirming = ref(false);
const busy = ref(false);

async function remove() {
  busy.value = true;
  try {
    await sendAdminCommand(`/api/admin/suggestions/${props.item.id}`, { method: "DELETE" });
    toast.success("意见已删除。");
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "删除失败。");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="confirming">
    <span class="confirm">删除《{{ item.title }}》及其投票和评论？删除后不可恢复，已完成列表也不再显示。</span>
    <NButton size="small" type="error" :disabled="disabled" :loading="busy" @click="remove">确认删除</NButton>
    <NButton size="small" quaternary :disabled="busy" @click="confirming = false">取消</NButton>
  </template>
  <NButton v-else size="small" type="error" :disabled="disabled" @click="confirming = true">删除</NButton>
</template>

<style scoped>
.confirm { font-size: var(--fs-sm); color: var(--fg-secondary); }
</style>
