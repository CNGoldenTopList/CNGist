<script setup lang="ts">
/**
 * 玩家撤回自己的提交。任何状态都能撤 —— 撤回后记录进回收站，由管理员决定去留。
 * 只有记录主人看得到这个入口；管理员要删记录走后台的回收站命令，不借这条路。
 */
import { computed, ref } from "vue";
import { NButton } from "naive-ui";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { confirmAction, toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";

const props = defineProps<{
  recordId: number;
  playerId: number;
  /** 撤回成功后的收尾；不传就回到玩家页，因为当前这条记录已经没了。 */
  onDone?: () => void;
}>();

const { t, apiError } = useLanguage();
const router = useRouter();
const { account } = storeToRefs(useSessionStore());
const busy = ref(false);

const isOwner = computed(() => account.value?.claimedPlayerId === props.playerId);

async function run() {
  const confirmed = await confirmAction({
    title: t("player.withdraw"),
    content: t("player.withdrawConfirm"),
    positiveText: t("player.withdraw"),
    negativeText: t("common.cancel"),
    danger: true,
  });
  if (!confirmed) return;
  busy.value = true;
  const { ok, data } = await api.delete(`/api/submissions/${props.recordId}`);
  busy.value = false;
  if (!ok) { toast.error(apiError(data, "common.saveFailed")); return; }
  toast.success(t("player.withdrawDone"));
  if (props.onDone) props.onDone();
  else void router.push(`/player/${props.playerId}`);
}
</script>

<template>
  <NButton v-if="isOwner" size="small" type="error" :loading="busy" @click="run">{{ t("player.withdraw") }}</NButton>
</template>
