<script setup lang="ts">
/**
 * /challenge/:id 的重定向。
 *
 * 挑战视图并在地图页里；这条路由只为已经分享出去的旧地址存在。
 * 多地图挑战仍是独立实体，转到它自己的页面。
 */
import { watch } from "vue";
import { useRouter } from "vue-router";
import { catalog, catalogReady } from "@/lib/catalog";
import { challengeHref, multiChallengeHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";
import EntityPage from "@/components/EntityPage.vue";
import MissingEntity from "@/components/MissingEntity.vue";
import LoadState from "@/components/LoadState.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useLanguage();

/* 目录到位之前找不到挑战，等目录就绪后再判断。 */
watch(catalogReady, (ready) => {
  if (!ready) return;
  const id = Number(props.id);
  const challenge = catalog.value.challenges.find((item) => item.id === id);
  if (challenge) { void router.replace(challengeHref(challenge.id, challenge.mapId)); return; }
  const multi = catalog.value.multiMapChallenges.find((item) => item.id === id);
  if (multi) void router.replace(multiChallengeHref(multi.id));
}, { immediate: true });
</script>

<template>
  <MissingEntity v-if="catalogReady && !catalog.challenges.some((c) => c.id === Number(id)) && !catalog.multiMapChallenges.some((c) => c.id === Number(id))" label="entity.missingChallenge" />
  <EntityPage v-else>
    <LoadState variant="page" :label="t('entity.loadingChallenge')" />
  </EntityPage>
</template>
