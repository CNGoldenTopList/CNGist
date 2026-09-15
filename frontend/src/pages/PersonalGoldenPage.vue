<script setup lang="ts">
/** 个人金榜：转到自己的玩家页；未认领时转到认领页。 */
import { watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import LoadState from "@/components/LoadState.vue";

const router = useRouter();
const { t } = useLanguage();
const { account, ready } = storeToRefs(useSessionStore());

/* 会话还没回来之前不能判断有没有认领，否则每次都会先弹去认领页。 */
watch([ready, account], () => {
  if (!ready.value) return;
  void router.replace(account.value?.claimedPlayerId ? `/player/${account.value.claimedPlayerId}` : "/claim");
}, { immediate: true });
</script>

<template>
  <PageShell>
    <LoadState variant="page" :label="t('player.openPage')" />
  </PageShell>
</template>
