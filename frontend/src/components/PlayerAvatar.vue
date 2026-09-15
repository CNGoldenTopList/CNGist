<script setup lang="ts">
/** 玩家头像。取自 B 站，后端带缓存；没有或取不到时退回名字首字母。 */
import { onUnmounted, ref, watch } from "vue";
import { api } from "@/lib/api";
import { subscribeAvatar } from "@/lib/avatar";

const props = defineProps<{ playerId?: number; name: string }>();

const url = ref<string | null>(null);
const failed = ref(false);
let unsubscribe: (() => void) | null = null;

watch(() => props.playerId, (playerId) => {
  unsubscribe?.();
  unsubscribe = null;
  url.value = null;
  failed.value = false;
  if (!playerId) return;

  unsubscribe = subscribeAvatar(playerId, (next) => { url.value = next; failed.value = false; });
  void api.get<{ url?: string | null }>(`/api/players/${playerId}/avatar`).then(({ ok, data }) => {
    if (ok && props.playerId === playerId) url.value = data.url ?? null;
  });
}, { immediate: true });

onUnmounted(() => unsubscribe?.());
</script>

<template>
  <span class="avatar" aria-hidden="true">
    <img v-if="url && !failed" :src="url" alt="" referrerpolicy="no-referrer" @error="failed = true" />
    <template v-else>{{ name.slice(0, 1).toUpperCase() }}</template>
  </span>
</template>

<style scoped>
.avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: var(--avatar-size, 26px);
  height: var(--avatar-size, 26px);
  border-radius: 50%;
  background: var(--bg-overlay);
  color: var(--fg-default);
  font-family: var(--font-num);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  flex: 0 0 auto;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
