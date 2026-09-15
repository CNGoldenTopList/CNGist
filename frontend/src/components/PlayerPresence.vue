<script setup lang="ts">
/**
 * 在线状态条。玩家主页与愿望单共用；详细观测只有本人的愿望单会传进来。
 *
 * 轮询只在标签页可见时进行：后台标签每十秒打一次接口没有任何意义。
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";

const props = defineProps<{
  playerId: number;
  isOwner?: boolean;
  room?: string | null;
  position?: string | null;
  runNumber?: number | null;
  holdingGolden?: boolean | null;
}>();

type PresenceSummary = { status: "online" | "offline" | "not_installed"; mapName?: string | null; mapId?: number | null };

const { t } = useLanguage();
const presence = ref<PresenceSummary | null>(null);
const failed = ref(false);

let timer = 0;
let pending = false;

async function load() {
  if (document.visibilityState !== "visible" || pending) return;
  pending = true;
  const target = props.playerId;
  const { ok, data } = await api.get<{ presence: PresenceSummary }>(`/api/players/${target}/presence`);
  if (props.playerId === target) {
    if (ok) { presence.value = data.presence; failed.value = false; } else { presence.value = null; failed.value = true; }
  }
  pending = false;
}

function stop() {
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", load);
}

watch(() => props.playerId, () => {
  stop();
  presence.value = null;
  failed.value = false;
  void load();
  timer = window.setInterval(() => void load(), 10_000);
  document.addEventListener("visibilitychange", load);
}, { immediate: true });

onUnmounted(stop);

const online = computed(() => presence.value?.status === "online");
const label = computed(() => {
  if (!presence.value) return t(failed.value ? "player.statusUnavailable" : "common.loading");
  if (presence.value.status === "online") return t("player.online");
  if (presence.value.status === "offline") return t("player.offline");
  return t("player.modNotInstalled");
});
</script>

<template>
  <div class="bar" :data-online="online || undefined" role="status">
    <span class="dot" aria-hidden="true" />
    <RouterLink v-if="presence?.status === 'not_installed' && isOwner" class="link" to="/tracker/install">{{ label }}</RouterLink>
    <span v-else class="label">{{ label }}</span>
    <template v-if="online && presence">
      <span class="location">
        <template v-if="presence.mapName">
          <RouterLink v-if="presence.mapId" class="link" :to="`/map/${presence.mapId}`">{{ presence.mapName }}</RouterLink>
          <template v-else>{{ presence.mapName }}</template>
        </template>
        <template v-else>{{ t("wishlist.liveMenu") }}</template>
      </span>
      <span v-if="room" class="detail">{{ room }}<span v-if="position" class="position">{{ position }}</span></span>
      <span v-if="runNumber != null" class="detail">{{ t("tracker.run") }} <span class="number">#{{ runNumber }}</span></span>
      <span v-if="holdingGolden" class="golden">{{ t("tracker.live.holdingGolden") }}</span>
    </template>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-surface);
  border: var(--hairline);
  border-left: var(--rail-w) solid var(--fg-disabled);
  border-radius: var(--r-sm);
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  line-height: var(--lh-snug);
  color: var(--fg-secondary);
  overflow-wrap: anywhere;
}
.bar[data-online] { border-left-color: var(--ok-600); }
.dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--fg-disabled); }
.bar[data-online] .dot { background: var(--ok-400); }
.label { font-weight: var(--fw-medium); }
.location { color: var(--fg-default); }
.link { color: var(--link); }
.link:hover { text-decoration: underline; }
.detail { color: var(--fg-muted); }
.position { margin-left: var(--sp-2); color: var(--fg-subtle); }
.number { font-variant-numeric: tabular-nums; }
.golden { color: var(--brand-mark); }
</style>
