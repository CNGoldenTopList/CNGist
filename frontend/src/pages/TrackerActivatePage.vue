<script setup lang="ts">
/**
 * 设备授权确认页。
 *
 * mod 打开浏览器到这里，带上回环地址和 PKCE 挑战。玩家登录并确认后，网站签发
 * 一次性授权码并 302 回本机端口；游戏全屏唤不起浏览器时 mod 可以不带回环地址，
 * 这时授权码显示在页面上由玩家复制。两条路径共用同一个兑换端点。
 *
 * 参数不合法就不显示确认按钮 —— 不让玩家确认一个我们不打算兑现的请求。
 * 校验用的是和服务端同一份 shared 逻辑。
 */
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { NButton } from "naive-ui";
import { storeToRefs } from "pinia";
import { parseAuthorizeRequest } from "@shared/tracker/device-auth-request";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LinkButton from "@/components/LinkButton.vue";
import I18nMessage from "@/components/I18nMessage.vue";

const route = useRoute();
const { t, apiError } = useLanguage();
const { account } = storeToRefs(useSessionStore());

const code = ref("");
const busy = ref(false);

const one = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const request = computed(() => parseAuthorizeRequest({
  redirect_uri: one(route.query.redirect_uri),
  code_challenge: one(route.query.code_challenge),
  code_challenge_method: one(route.query.code_challenge_method),
  state: one(route.query.state),
  device_name: one(route.query.device_name),
  client_name: one(route.query.client_name),
}));

async function approve() {
  const current = request.value;
  if (!current) return;
  busy.value = true;
  const { ok, data } = await api.post<{ redirectTo?: string; code?: string }>("/api/tracker/authorizations", {
    redirect_uri: current.redirectUri,
    code_challenge: current.codeChallenge,
    code_challenge_method: "S256",
    state: current.state,
    device_name: current.deviceName,
    client_name: current.clientName,
  });
  busy.value = false;
  if (!ok) { toast.error(apiError(data)); return; }
  // 有回环地址就把码交给本机监听端，玩家什么都不用复制。
  if (data.redirectTo) { window.location.replace(data.redirectTo); return; }
  code.value = data.code ?? "";
}
</script>

<template>
  <PageShell :eyebrow="t('activate.eyebrow')" :title="t('activate.title')" :lede="t('activate.lede')">
    <PanelBlock>
      <p v-if="!request" class="notice">{{ t("activate.invalid") }}</p>

      <p v-else-if="!account" class="notice">
        <I18nMessage id="activate.gate">
          <template #link><RouterLink to="/account" target="_blank">{{ t("nav.account") }}</RouterLink></template>
        </I18nMessage>
        <NButton size="small" quaternary @click="$router.go(0)">{{ t("activate.recheck") }}</NButton>
      </p>

      <div v-else-if="code" class="done">
        <p class="notice">{{ t("activate.paste") }}</p>
        <code class="code">{{ code }}</code>
        <p class="fine">{{ t("activate.expiry") }}</p>
      </div>

      <template v-else>
        <!-- 玩家点确认之前该看清楚的就是这三行事实。 -->
        <dl class="facts">
          <div class="fact">
            <dt>{{ t("activate.device") }}</dt>
            <dd>{{ request.deviceName }}</dd>
          </div>
          <div v-if="request.clientName" class="fact">
            <dt>{{ t("activate.client") }}</dt>
            <dd>{{ request.clientName }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t("activate.account") }}</dt>
            <dd>{{ account.displayName }}</dd>
          </div>
        </dl>
        <p class="notice">{{ t("activate.grants") }}</p>
        <div class="actions">
          <NButton type="primary" :loading="busy" @click="approve">{{ t("activate.approve") }}</NButton>
          <LinkButton to="/account" quaternary>{{ t("activate.cancel") }}</LinkButton>
        </div>
      </template>
    </PanelBlock>
  </PageShell>
</template>

<style scoped>
.notice { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }
.fine { margin: 0; font-size: var(--fs-sm); color: var(--fg-subtle); }

.facts { display: grid; gap: var(--sp-3); margin: 0 0 var(--sp-5); }
.fact { display: grid; grid-template-columns: 96px 1fr; gap: var(--sp-4); align-items: baseline; }
.fact dt { font-size: var(--fs-micro); color: var(--fg-subtle); }
.fact dd { margin: 0; font-size: var(--fs-body); color: var(--fg-default); overflow-wrap: anywhere; }

.actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-5); }

.done { display: grid; gap: var(--sp-4); }
/* 手输兑换时给玩家复制的授权码。等宽并允许换行，别让它撑破容器。 */
.code {
  display: block;
  padding: var(--sp-4);
  background: var(--bg-inset);
  border-radius: var(--r-md);
  font-family: var(--font-num);
  font-size: var(--fs-lead);
  color: var(--fg-default);
  overflow-wrap: anywhere;
  user-select: all;
}

@media (max-width: 640px) {
  .fact { grid-template-columns: 1fr; gap: var(--sp-1); }
}
</style>
