<script setup lang="ts">
/**
 * 已绑定的登录方式，以及绑定 / 解绑入口。
 *
 * 可绑定的清单来自服务端的 provider 登记表，前端不硬编码。
 * 「至少保留一种」由服务端判定，这里只根据 canUnbind 决定要不要显示按钮。
 */
import { onMounted, ref } from "vue";
import { NButton } from "naive-ui";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { siteConfig } from "@/lib/site-config";
import { useSessionStore } from "@/stores/session";
import PanelBlock from "@/components/PanelBlock.vue";

export type BoundIdentity = { provider: string; email: string | null; lastLoginAt: string | null; canUnbind: boolean };

const { t, locale, apiError } = useLanguage();
const session = useSessionStore();

const identities = ref<BoundIdentity[]>([]);
const busy = ref("");

async function reload() {
  const { ok, data } = await api.get<{ bound?: BoundIdentity[] }>("/api/auth/methods");
  if (ok) identities.value = data.bound ?? [];
}
onMounted(reload);

const boundFor = (provider: string) => identities.value.find((item) => item.provider === provider);

async function unbind(provider: string) {
  busy.value = provider;
  const { ok, data } = await api.delete(`/api/auth/identity/${provider}`);
  busy.value = "";
  if (!ok) { toast.error(apiError(data, "account.unbindFailed")); return; }
  toast.success(t("account.unbind"));
  await Promise.all([reload(), session.refresh()]);
}

function statusText(provider: { id: string; kind: string }) {
  const bound = boundFor(provider.id);
  if (bound) {
    return bound.lastLoginAt
      ? t("account.lastLogin", { time: new Date(bound.lastLoginAt).toLocaleString(locale.value) })
      : t("account.boundUnused");
  }
  return provider.kind === "password" ? t("account.noPassword") : t("account.notBound");
}
</script>

<template>
  <PanelBlock :title="t('account.linked')" :subtitle="t('account.linkedHint')">
    <ul class="identities">
      <template v-for="provider in siteConfig.providers" :key="provider.id">
        <!-- 没绑过水鱼就不展示它：那条路径只从 /dflogin 进 -->
        <li v-if="provider.id !== 'diving-fish' || boundFor(provider.id)">
          <div class="who">
            <strong>{{ provider.name }}</strong>
            <span>{{ statusText(provider) }}</span>
          </div>
          <NButton
            v-if="boundFor(provider.id)?.canUnbind"
            quaternary
            size="small"
            :loading="busy === provider.id"
            @click="unbind(provider.id)"
          >{{ t("account.unbind") }}</NButton>
          <NButton
            v-else-if="!boundFor(provider.id) && provider.kind === 'oidc' && provider.startPath"
            tag="a"
            size="small"
            :href="`${provider.startPath}?mode=bind&next=/account`"
          >{{ t("account.bind") }}</NButton>
        </li>
      </template>
    </ul>
  </PanelBlock>
</template>

<style scoped>
.identities { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-4); }
.identities li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); }
.who { display: grid; gap: 2px; min-width: 0; }
.who strong { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); }
.who span { font-size: var(--fs-sm); color: var(--fg-subtle); }
</style>
