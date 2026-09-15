<script setup lang="ts">
/** 目录里找不到这个条目时的兜底。给一条回到后台的路，而不是一句灰话。 */
import { RouterLink } from "vue-router";
import { useLanguage, type MessageKey } from "@/i18n";
import EntityPage from "@/components/EntityPage.vue";

defineProps<{ label: MessageKey }>();
const { t } = useLanguage();
</script>

<template>
  <EntityPage>
    <p class="state">{{ t(label) }}</p>
    <p class="state-action"><RouterLink to="/admin?tab=challenges">{{ t("entity.backToAdmin") }}</RouterLink></p>
  </EntityPage>
</template>

<style scoped>
.state { margin: 0; padding: var(--sp-7) 0 var(--sp-3); text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }
.state-action { margin: 0; text-align: center; font-size: var(--fs-body); }
</style>
