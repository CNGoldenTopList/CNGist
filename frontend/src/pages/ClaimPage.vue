<script setup lang="ts">
/**
 * 玩家认领。生成一次性绑定码，玩家把它放进 B 站签名或专栏，服务端回读验证。
 *
 * 只轮询本站的待验证状态，不去请求 B 站 —— 那一步在服务端做；管理员手动
 * 接受后这里也会自动刷新。
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { NButton, NInput, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { searchable } from "@shared/search";
import { api } from "@/lib/api";
import { catalog, refreshCatalog } from "@/lib/catalog";
import { fetchSiteConfig } from "@/lib/site-config";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import I18nMessage from "@/components/I18nMessage.vue";

type BindingPayload = {
  id: number; bilibiliUid: string; bilibiliName: string; code: string;
  nextCheckAt: string; expiresAt: string;
};

const router = useRouter();
const { t, apiError } = useLanguage();
const session = useSessionStore();
const { account } = storeToRefs(session);

const query = ref("");
const newUid = ref("");
const selectedUids = ref<Record<number, string>>({});
const binding = ref<BindingPayload | null>(null);
const articleUrl = ref<string | null>(null);
const busy = ref(false);
const loaded = ref(false);
const clock = ref(Date.now());
/** 玩家点过「已改好签名」之后再放开验证按钮：B 站签名更新有延迟。 */
const signatureReadyAt = ref<number | null>(null);

let tick = 0;
let poll = 0;

async function reload() {
  if (!account.value || busy.value) return;
  const accountId = account.value.id;
  const { ok, data } = await api.get<{ binding: BindingPayload | null; articleUrl: string | null; account?: { claimedPlayerId?: number } }>("/api/auth/claim");
  if (!ok || account.value?.id !== accountId) return;
  binding.value = data.binding;
  articleUrl.value = data.articleUrl;
  loaded.value = true;
  if (data.account?.claimedPlayerId !== account.value?.claimedPlayerId) {
    await Promise.all([session.refresh(), refreshCatalog()]);
  }
}

function stopTimers() {
  window.clearInterval(tick);
  window.clearInterval(poll);
  window.removeEventListener("focus", onFocus);
}
const onFocus = () => { void reload(); };

watch(account, (value) => {
  stopTimers();
  binding.value = null;
  loaded.value = false;
  signatureReadyAt.value = null;
  if (!value) return;
  void reload();
  void fetchSiteConfig();
  window.addEventListener("focus", onFocus);
  tick = window.setInterval(() => { clock.value = Date.now(); }, 1000);
  poll = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 15_000);
}, { immediate: true });

onUnmounted(stopTimers);

async function action(kind: "begin" | "verify" | "cancel", input: { uid?: string; playerId?: number } = {}) {
  if (busy.value) return;
  busy.value = true;
  const accountId = account.value?.id;
  const { ok, data } = await api.post<{ binding?: BindingPayload | null; articleUrl?: string | null; account?: { claimedPlayerId?: number } }>(
    "/api/auth/claim", { action: kind, ...input });
  busy.value = false;
  if (account.value?.id !== accountId) return;
  if ("binding" in data) binding.value = data.binding ?? null;
  if ("articleUrl" in data) articleUrl.value = data.articleUrl ?? null;
  if (!ok) { toast.error(apiError(data)); return; }
  if (kind === "begin" || kind === "cancel") signatureReadyAt.value = null;
  if (data.account) {
    toast.success(t("binding.success"));
    await Promise.allSettled([session.refresh(), refreshCatalog()]);
    if (kind === "verify" && data.account.claimedPlayerId) {
      void router.replace(`/player/${data.account.claimedPlayerId}`);
    }
  }
}

const results = computed(() => {
  const players = catalog.value.players;
  if (!query.value.trim()) return players.slice(0, 24);
  return players
    .filter((player) => searchable([player.name, ...playerBilibiliUids(player), player.bilibiliUrl], player.aliases, query.value))
    .slice(0, 60);
});

const seconds = computed(() => (binding.value
  ? Math.max(0, Math.ceil((Math.max(Date.parse(binding.value.nextCheckAt), signatureReadyAt.value ?? 0) - clock.value) / 1000))
  : 0));
const expired = computed(() => (binding.value ? Date.parse(binding.value.expiresAt) <= clock.value : false));

const uidFor = (playerId: number, uids: string[]) => selectedUids.value[playerId] ?? uids[0];

async function copyCode() {
  if (!binding.value) return;
  try {
    await navigator.clipboard.writeText(binding.value.code);
    toast.success(t("binding.copied"));
  } catch {
    toast.error(t("binding.copyFailed"));
  }
}
</script>

<template>
  <PageShell :eyebrow="t('nav.claim')" :title="t('claim.title')" :lede="t('binding.lede')">
    <p v-if="!account" class="gate">
      <span class="gate-mark" aria-hidden="true" />
      <I18nMessage id="claim.gate">
        <template #link><RouterLink to="/account">{{ t("nav.account") }}</RouterLink></template>
      </I18nMessage>
    </p>

    <p v-else-if="!loaded" class="section-hint">{{ t("binding.loading") }}</p>

    <section v-if="account && binding" class="binding">
      <h2 class="binding-title">{{ t("binding.title") }}</h2>
      <a :href="`https://space.bilibili.com/${binding.bilibiliUid}`" target="_blank" rel="noreferrer">
        {{ binding.bilibiliName }} · UID {{ binding.bilibiliUid }}
      </a>
      <div class="row-form">
        <strong class="code">{{ binding.code }}</strong>
        <NButton size="small" @click="copyCode">{{ t("binding.copy") }}</NButton>
      </div>
      <p class="section-hint">{{ t("binding.validity") }}</p>

      <p v-if="expired" role="status">{{ t("error.bindingInvalid") }}</p>
      <template v-else>
        <h3 class="method-title">{{ t("binding.signatureTitle") }}</h3>
        <p class="section-hint">{{ t("binding.signatureHint") }}</p>
        <div class="row-form">
          <NButton
            v-if="signatureReadyAt === null"
            :disabled="busy"
            @click="signatureReadyAt = Date.now() + 10_000; clock = Date.now()"
          >{{ t("binding.changed") }}</NButton>
          <NButton v-else :disabled="busy || seconds > 0" :loading="busy" @click="action('verify')">
            {{ seconds > 0 ? t("binding.wait", { seconds }) : t("binding.verify") }}
          </NButton>
        </div>

        <h3 class="method-title">{{ t("binding.manualTitle") }}</h3>
        <p class="section-hint">{{ t("binding.manualHint") }}</p>
        <a v-if="articleUrl" class="article-link" :href="articleUrl" target="_blank" rel="noreferrer">{{ t("binding.article") }}</a>
        <p v-else class="section-hint">{{ t("binding.manualUnavailable") }}</p>
      </template>

      <div class="row-form">
        <NButton :disabled="busy" @click="action('cancel')">{{ t("binding.cancel") }}</NButton>
      </div>
    </section>

    <NInput v-model:value="query" class="search" clearable :placeholder="t('claim.searchPlaceholder')" :aria-label="t('claim.searchPlaceholder')" />
    <p class="count">{{ t("claim.total", { count: catalog.players.length }) }}</p>

    <ul class="list">
      <li v-for="player in results" :key="player.id" class="row">
        <div class="identity">
          <strong>{{ player.name }}</strong>
          <NSelect
            v-if="playerBilibiliUids(player).length > 1"
            :value="uidFor(player.id, playerBilibiliUids(player))"
            size="tiny"
            class="uid-select"
            :options="playerBilibiliUids(player).map((value) => ({ value, label: `UID ${value}` }))"
            :aria-label="t('binding.selectUid')"
            @update:value="(value: string) => selectedUids[player.id] = value"
          />
          <span v-else class="meta">{{ playerBilibiliUids(player)[0] ? `UID ${playerBilibiliUids(player)[0]}` : t("binding.noUid") }}</span>
        </div>
        <NButton
          size="small"
          :disabled="!account || !loaded || busy || account?.claimedPlayerId === player.id || Boolean(binding) || !uidFor(player.id, playerBilibiliUids(player))"
          @click="action('begin', { playerId: player.id, uid: uidFor(player.id, playerBilibiliUids(player)) })"
        >
          {{ account?.claimedPlayerId === player.id ? t("claim.claimed") : t("binding.generate") }}
        </NButton>
      </li>
      <li v-if="!results.length" class="empty">{{ t("claim.empty") }}</li>
    </ul>

    <section class="new-identity">
      <h2 class="section-title">{{ t("claim.newTitle") }}</h2>
      <p class="section-hint">{{ t("binding.newHint") }}</p>
      <div class="row-form">
        <NInput
          v-model:value="newUid"
          class="uid-input"
          :placeholder="t('claim.uidPlaceholder')"
          :aria-label="t('claim.uidPlaceholder')"
          :disabled="!account || busy || Boolean(binding)"
        />
        <NButton
          :disabled="!account || !loaded || busy || Boolean(binding) || !newUid.trim()"
          :loading="busy"
          @click="action('begin', { uid: newUid })"
        >{{ t("binding.generate") }}</NButton>
      </div>
    </section>
  </PageShell>
</template>

<style scoped>
.gate {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--danger-500);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--fs-body);
  color: var(--fg-secondary);
}
.gate-mark { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--danger-400); }

.search { max-width: 360px; }
.count { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }

/* 认领列表：细线分隔的一列，右侧动作按钮走固定槽位。 */
.list { margin: 0; padding: 0; list-style: none; display: grid; border-top: var(--hairline); }
.row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); padding: var(--sp-3) 0; border-bottom: var(--hairline); }
.identity { display: grid; gap: 2px; min-width: 0; }
.identity strong { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: anywhere; }
.meta { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-micro); color: var(--fg-subtle); }
.uid-select { max-width: 200px; }

.empty { padding: var(--sp-6) 0; text-align: center; font-size: var(--fs-body); color: var(--fg-subtle); }

.new-identity { display: grid; gap: var(--sp-3); margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: var(--hairline); }
.section-title { margin: 0; font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); }
.section-hint { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }
.row-form { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
.uid-input { flex: 1 1 240px; max-width: 320px; }

.binding { display: grid; gap: var(--sp-3); padding: var(--sp-5); background: var(--bg-raised); border: var(--hairline); border-radius: var(--r-sm); }
/* 绑定码要能被一次选中复制，所以 user-select: all。 */
.code { font-family: var(--font-num); font-size: var(--fs-h2); letter-spacing: .12em; user-select: all; }
.binding-title { margin: 0; font-size: var(--fs-h2); font-weight: var(--fw-medium); color: var(--fg-default); }
.method-title { margin: 0; font-size: var(--fs-h3); font-weight: var(--fw-medium); color: var(--fg-default); }
.article-link { font-size: var(--fs-sm); }
</style>
