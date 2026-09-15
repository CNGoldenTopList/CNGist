<script setup lang="ts">
/**
 * 指认上传数据对应的地图。
 *
 * mod 只知道游戏内的地图标识（SID）和面，目录里没有这个标识，所以第一次上传
 * 某张图的数据后要由玩家自己指认它是目录里的哪张地图。提交后等管理员审核，
 * 通过之后这条配对对全站生效 —— 别人再上传同一张图就不用再指认一次。
 *
 * 只能选地图。地图包、多地图挑战和具体挑战都不在这里配：CCT 的统计作用域就是
 * 一张图的一个面，同一张图的 C 与 FC 共用同一份数据，配到挑战上会是假的。
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { NButton, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { api } from "@/lib/api";
import { catalog } from "@/lib/catalog";
import { useLanguage, type MessageKey } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import PanelBlock from "@/components/PanelBlock.vue";

type Scope = { sid: string; side: "Normal" | "BSide" | "CSide"; pendingMapId: number | null };

const { t, apiError } = useLanguage();
const { account } = storeToRefs(useSessionStore());

const scopes = ref<Scope[]>([]);
const picked = ref<Record<string, number | null>>({});
const busy = ref("");

let timer = 0;
let loading = false;

async function load() {
  if (document.visibilityState !== "visible" || loading) return;
  loading = true;
  const { ok, data } = await api.get<{ scopes?: Scope[] }>("/api/tracker/map-binding");
  // 取不到就保留已有列表，下一轮重试。
  if (ok) scopes.value = data.scopes ?? [];
  loading = false;
}

function stop() {
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", load);
}

watch(account, (value) => {
  stop();
  scopes.value = [];
  if (!value) return;
  void load();
  timer = window.setInterval(() => void load(), 30_000);
  document.addEventListener("visibilitychange", load);
}, { immediate: true });

onUnmounted(stop);

/**
 * 候选只取地图。不同地图包里常有同名地图，因此重名时把包名写进候选文字本身 ——
 * 光把包名放在副标题里会让两张图在选单里无法区分。
 */
const options = computed(() => {
  const packs = new Map(catalog.value.campaigns.map((item) => [item.id, item.name]));
  const plain = (item: { name: string; cnName?: string }) => (item.cnName ? `${item.name}（${item.cnName}）` : item.name);
  const seen = new Map<string, number>();
  for (const item of catalog.value.maps) seen.set(plain(item), (seen.get(plain(item)) ?? 0) + 1);
  return catalog.value.maps.map((item) => {
    const pack = (item.campaignId ? packs.get(item.campaignId) : "") ?? "";
    const label = (seen.get(plain(item)) ?? 0) > 1 && pack ? `${plain(item)} — ${pack}` : plain(item);
    return { value: item.id, label };
  });
});

const keyOf = (scope: Scope) => `${scope.sid} ${scope.side}`;
const sideLabel = (side: Scope["side"]) => t(`binding.side${side}` as MessageKey);

async function submit(scope: Scope) {
  const key = keyOf(scope);
  const mapId = picked.value[key];
  if (!mapId) { toast.error(t("error.trackerMapRequired")); return; }
  busy.value = key;
  const { ok, data } = await api.post("/api/tracker/map-binding", { sid: scope.sid, side: scope.side, mapId });
  busy.value = "";
  if (!ok) { toast.error(apiError(data)); return; }
  toast.success(t("binding.submitted"));
  scopes.value = scopes.value.map((item) =>
    (item.sid === scope.sid && item.side === scope.side ? { ...item, pendingMapId: mapId } : item));
}
</script>

<template>
  <PanelBlock v-if="account && scopes.length" :title="t('binding.title')" :subtitle="t('binding.lede')">
    <ul class="rows">
      <li v-for="scope in scopes" :key="keyOf(scope)" class="row">
        <span class="scope">
          <code class="sid">{{ scope.sid }}</code>
          <span class="side">{{ sideLabel(scope.side) }}</span>
        </span>
        <span v-if="scope.pendingMapId" class="pending">{{ t("binding.pending") }}</span>
        <template v-else>
          <NSelect
            :value="picked[keyOf(scope)] ?? null"
            :options="options"
            filterable
            clearable
            :placeholder="t('binding.pick')"
            :aria-label="t('binding.pick')"
            @update:value="(value: number | null) => picked[keyOf(scope)] = value"
          />
          <NButton size="small" type="primary" :disabled="busy === keyOf(scope)" @click="submit(scope)">
            {{ t("binding.submit") }}
          </NButton>
        </template>
      </li>
    </ul>
  </PanelBlock>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }

/* SID 可能很长，让它占满剩余宽度并允许换行，右侧的选择器与按钮保持固定槽位。 */
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px) auto; align-items: center; gap: var(--sp-3); }

.scope { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
.sid { font-family: var(--font-num); font-size: var(--fs-sm); color: var(--fg-default); overflow-wrap: anywhere; }
.side { font-size: var(--fs-micro); color: var(--fg-subtle); white-space: nowrap; }
.pending { grid-column: 2 / -1; font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .row { grid-template-columns: 1fr; }
  .pending { grid-column: 1; }
}
</style>
