<script setup lang="ts">
/** 前台页面上的后台入口。只有开启管理模式的管理员看得到。后台界面仍是中文。 */
import { storeToRefs } from "pinia";
import { useSessionStore } from "@/stores/session";
import LinkButton from "@/components/LinkButton.vue";

const props = defineProps<{
  kind: "player" | "map" | "campaign" | "challenge";
  id: number;
  label: string;
}>();

const { isAdmin, adminMode } = storeToRefs(useSessionStore());

const href = () => `/admin?entity=${props.kind}&id=${props.id}&q=${encodeURIComponent(props.label)}`;
</script>

<template>
  <aside v-if="isAdmin && adminMode" class="entity-tools">
    <span>管理工具</span>
    <LinkButton :to="href()" size="tiny" quaternary>在后台打开</LinkButton>
  </aside>
</template>

<style scoped>
.entity-tools {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--fg-subtle);
}
</style>
