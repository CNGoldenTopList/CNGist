<script setup lang="ts">
/**
 * 登录面板。**渲染什么完全由服务端的 provider 清单决定**，不硬编码任何登录方式。
 * 将来加 provider 只改服务端登记表，这里不动。
 */
import { computed, ref } from "vue";
import { NButton, NInput, NTab, NTabs } from "naive-ui";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import { siteConfig } from "@/lib/site-config";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";

const { t, apiError } = useLanguage();
const session = useSessionStore();

const mode = ref<"login" | "register" | "forgot">("login");
const sending = ref(false);
const email = ref("");
const displayName = ref("");
const password = ref("");

// 水鱼登录仅通过 /dflogin 进入，不在登录面板展示。
const federated = computed(() => siteConfig.value.providers.filter((item) => item.id !== "diving-fish" && item.kind === "oidc" && item.startPath));
const passwordEnabled = computed(() => siteConfig.value.providers.some((item) => item.kind === "password"));
const mailEnabled = computed(() => siteConfig.value.mailAvailable);

async function submitForgot() {
  sending.value = true;
  const { ok, data } = await api.post<{ message?: string }>("/api/auth/password/forgot", { email: email.value });
  sending.value = false;
  if (!ok) { toast.error(apiError(data, "auth.sendFailed")); return; }
  toast.success(data.message || t("auth.resetSent"));
}

async function submitIdentity() {
  const result = mode.value === "register"
    ? await session.registerWithEmail(email.value, password.value, displayName.value)
    : await session.loginWithEmail(email.value, password.value);
  if (!result.ok) { toast.error(result.error); return; }
  toast.success(mode.value === "register" ? t("auth.registered") : t("auth.loggedIn"));
  password.value = "";
}

const tabMode = computed({
  get: () => (mode.value === "register" ? "register" : "login"),
  set: (value: string) => { mode.value = value as "login" | "register"; },
});
</script>

<template>
  <PanelBlock :title="t('auth.panel')">
    <form v-if="passwordEnabled && mode === 'forgot'" class="form" @submit.prevent="submitForgot">
      <FormField :label="t('auth.registeredEmail')" :hint="t('auth.forgotHint')" required wide>
        <NInput v-model:value="email" type="text" placeholder="name@example.com" />
      </FormField>
      <div class="actions">
        <NButton attr-type="submit" type="primary" :loading="sending">{{ t("auth.sendReset") }}</NButton>
        <NButton quaternary @click="mode = 'login'">{{ t("auth.backToLogin") }}</NButton>
      </div>
    </form>

    <template v-if="passwordEnabled && mode !== 'forgot'">
      <div class="tabs">
        <NTabs justify-content="space-around" show-scroll-button v-model:value="tabMode" type="line" size="small" :aria-label="t('auth.method')">
          <NTab name="login">{{ t("auth.emailLogin") }}</NTab>
          <NTab name="register">{{ t("auth.emailRegister") }}</NTab>
        </NTabs>
      </div>
      <form class="form" @submit.prevent="submitIdentity">
        <FormField v-if="mode === 'register'" :label="t('auth.displayName')" required wide>
          <NInput v-model:value="displayName" :placeholder="t('auth.displayNamePlaceholder')" />
        </FormField>
        <FormField :label="t('auth.email')" required wide>
          <NInput v-model:value="email" placeholder="name@example.com" />
        </FormField>
        <FormField :label="t('auth.password')" :hint="t('auth.passwordHint')" required wide>
          <NInput v-model:value="password" type="password" show-password-on="click" />
        </FormField>
        <div class="actions">
          <NButton attr-type="submit" type="primary">{{ mode === "register" ? t("auth.registerAndLogin") : t("nav.login") }}</NButton>
          <NButton v-if="mode === 'login' && mailEnabled" quaternary size="small" @click="mode = 'forgot'">{{ t("auth.forgot") }}</NButton>
        </div>
      </form>
    </template>

    <div v-if="federated.length && passwordEnabled" class="divider">{{ t("auth.or") }}</div>

    <div v-if="federated.length" class="providers">
      <NButton v-for="item in federated" :key="item.id" tag="a" :href="`${item.startPath}?next=/account`" block>
        {{ item.label }}
      </NButton>
    </div>

    <p v-if="!siteConfig.providers.length" class="empty">{{ t("auth.noProviders") }}</p>
  </PanelBlock>
</template>

<style scoped>
.form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-5); }
.actions { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 页签自身不带外边距，靠这里和下方表单拉开距离，与表单内部 gap 对齐 */
.tabs { margin-bottom: var(--sp-5); max-width: 280px; }
.providers { display: grid; gap: var(--sp-3); }
.divider {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: var(--sp-5) 0;
  font-size: var(--fs-sm);
  color: var(--fg-subtle);
}
.divider::before,
.divider::after { content: ""; flex: 1; border-top: var(--hairline); }
.empty { font-size: var(--fs-body); color: var(--fg-subtle); margin: 0; }

@media (max-width: 640px) {
  .form { grid-template-columns: 1fr; }
}
</style>
