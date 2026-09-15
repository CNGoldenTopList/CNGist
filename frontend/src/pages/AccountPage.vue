<script setup lang="ts">
/** 个人账户。未登录时这一页就是登录面板。 */
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NInput } from "naive-ui";
import { storeToRefs } from "pinia";
import { api } from "@/lib/api";
import { fetchSiteConfig, siteConfig } from "@/lib/site-config";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LoginPanel from "@/components/LoginPanel.vue";
import LinkedAccountsPanel from "@/components/LinkedAccountsPanel.vue";
import TrackerDevicesPanel from "@/components/TrackerDevicesPanel.vue";
import FormField from "@/components/FormField.vue";
import LinkButton from "@/components/LinkButton.vue";

const { t, apiError } = useLanguage();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { account, isAdmin } = storeToRefs(session);

const email = ref("");
const displayName = ref("");
const currentPassword = ref("");
const nextPassword = ref("");
const resending = ref(false);

watch(account, (value) => {
  if (!value) return;
  email.value = value.email;
  displayName.value = value.displayName;
}, { immediate: true });

onMounted(() => {
  void fetchSiteConfig();

  /* 第三方登录回跳时把结果挂在查询串上：认识错误码就按当前语言播报，
     否则用服务端原文。读一次就从地址栏清掉，刷新不会再弹一遍。 */
  const failure = route.query.auth_error as string | undefined;
  const notice = route.query.auth_notice as string | undefined;
  if (!failure && !notice) return;
  if (failure) toast.error(apiError({ error: failure, code: route.query.auth_error_code as string | undefined }));
  if (notice) toast.success(route.query.auth_notice_key === "account.emailVerified" ? t("account.emailVerified") : notice);
  const query = { ...route.query };
  delete query.auth_error;
  delete query.auth_error_code;
  delete query.auth_notice;
  delete query.auth_notice_key;
  void router.replace({ path: route.path, query });
});

async function resendVerification() {
  resending.value = true;
  const { ok, data } = await api.post("/api/auth/email/verify");
  resending.value = false;
  if (!ok) { toast.error(apiError(data, "auth.sendFailed")); return; }
  toast.success(t("account.verifySent"));
}

async function saveProfile() {
  const result = await session.updateAccount({
    email: email.value.trim(),
    displayName: displayName.value.trim() || account.value?.displayName,
  });
  if (!result.ok) { toast.error(result.error); return; }
  toast.success(t("account.profileSaved"));
}

async function savePassword() {
  const result = await session.changePassword(currentPassword.value, nextPassword.value);
  if (!result.ok) { toast.error(result.error); return; }
  toast.success(t("account.passwordSaved"));
  currentPassword.value = "";
  nextPassword.value = "";
}

async function signOut() {
  await session.logout();
  toast.success(t("nav.logout"));
}
</script>

<template>
  <PageShell
    :eyebrow="t('nav.account')"
    :title="account ? account.displayName : t('account.title')"
    :lede="t('account.lede')"
  >
    <template v-if="account" #actions>
      <NButton quaternary @click="signOut">{{ t("nav.logout") }}</NButton>
    </template>

    <LoginPanel v-if="!account" />
    <template v-else>
      <PanelBlock v-if="account.email && !account.emailVerified" :title="t('account.unverified')" :subtitle="t('account.unverifiedHint')">
        <div class="claim">
          <div class="claim-text">
            <strong>{{ account.email }}</strong>
            <span>{{ siteConfig.mailAvailable ? t("account.checkSpam") : t("account.noMail") }}</span>
          </div>
          <NButton v-if="siteConfig.mailAvailable" :loading="resending" @click="resendVerification">{{ t("account.resend") }}</NButton>
        </div>
      </PanelBlock>

      <PanelBlock :title="t('account.bilibili')" :subtitle="t('account.bilibiliHint')">
        <div class="claim">
          <div class="claim-text">
            <strong>{{ account.claimedBilibiliName || t("account.notClaimed") }}</strong>
            <span>
              {{ account.claimedPlayerId ? t("account.claimVerified") : t("account.claimPending") }}
              {{ account.bilibiliUid ? ` · UID ${account.bilibiliUid}` : "" }}
              {{ isAdmin ? ` · ${t("account.adminBadge")}` : "" }}
            </span>
          </div>
          <LinkButton to="/claim" :type="account.claimedPlayerId ? 'default' : 'primary'">
            {{ account.claimedPlayerId ? t("account.changeClaim") : t("account.searchClaim") }}
          </LinkButton>
        </div>
      </PanelBlock>

      <LinkedAccountsPanel />
      <TrackerDevicesPanel />

      <PanelBlock :title="t('account.profile')">
        <form class="form" @submit.prevent="saveProfile">
          <FormField :label="t('auth.displayName')"><NInput v-model:value="displayName" /></FormField>
          <FormField :label="t('auth.registeredEmail')" required><NInput v-model:value="email" /></FormField>
          <div class="actions"><NButton attr-type="submit" type="primary">{{ t("account.saveProfile") }}</NButton></div>
        </form>
      </PanelBlock>

      <PanelBlock :title="t('account.changePassword')">
        <form class="form" @submit.prevent="savePassword">
          <FormField :label="t('account.currentPassword')" required>
            <NInput v-model:value="currentPassword" type="password" show-password-on="click" />
          </FormField>
          <FormField :label="t('account.newPassword')" :hint="t('auth.passwordHint')" required>
            <NInput v-model:value="nextPassword" type="password" show-password-on="click" />
          </FormField>
          <div class="actions"><NButton attr-type="submit" type="primary">{{ t("account.updatePassword") }}</NButton></div>
        </form>
      </PanelBlock>

      <PanelBlock title="QQ" :subtitle="t('account.qqHint')">
        <NButton disabled>{{ t("account.connectQq") }}</NButton>
      </PanelBlock>
    </template>
  </PageShell>
</template>

<style scoped>
.form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-5); }
.actions { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 已认领身份：左侧信息、右侧动作 */
.claim {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding: var(--sp-4);
  background: var(--bg-inset);
  border-radius: var(--r-md);
}
.claim-text { display: grid; gap: 2px; min-width: 0; }
.claim-text strong { font-size: var(--fs-lead); font-weight: var(--fw-medium); color: var(--fg-default); }
.claim-text span { font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .form { grid-template-columns: 1fr; }
}
</style>
