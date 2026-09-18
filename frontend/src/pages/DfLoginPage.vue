<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { useLanguage } from "@/i18n";
import EntityPage from "@/components/EntityPage.vue";
import LoadState from "@/components/LoadState.vue";

const route = useRoute();
const { t } = useLanguage();

onMounted(() => {
  // 恢复水鱼登录短链接；next / mode 原样交给现有授权接口校验。
  const search = new URL(route.fullPath, window.location.origin).search;
  window.location.replace(`/api/auth/login/diving-fish${search}`);
});
</script>

<template>
  <EntityPage>
    <LoadState variant="page" :label="t('common.loading')" />
  </EntityPage>
</template>
