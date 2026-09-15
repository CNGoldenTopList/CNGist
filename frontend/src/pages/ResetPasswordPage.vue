<script setup lang="ts">
/** 密码重置落地页。令牌从邮件链接的查询串带来。 */
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { NButton, NInput } from "naive-ui";
import { api } from "@/lib/api";
import { fetchSiteConfig, siteConfig } from "@/lib/site-config";
import { useLanguage } from "@/i18n";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import LinkButton from "@/components/LinkButton.vue";

const route = useRoute();
const { t, apiError } = useLanguage();

const token = computed(() => String(route.query.token ?? ""));
const password = ref("");
const confirm = ref("");
const busy = ref(false);
const done = ref(false);
const error = ref("");

onMounted(() => { void fetchSiteConfig(); });

async function submit() {
  error.value = "";
  if (password.value !== confirm.value) { error.value = t("reset.mismatch"); return; }
  busy.value = true;
  const result = await api.post("/api/auth/password/reset", { token: token.value, password: password.value });
  busy.value = false;
  if (!result.ok) { error.value = apiError(result.data, "reset.failed"); return; }
  done.value = true;
}
</script>

<template>
  <PageShell :eyebrow="t('reset.eyebrow')" :title="t('reset.title')" :lede="t('reset.lede')">
    <PanelBlock v-if="!siteConfig.mailAvailable" :title="t('reset.unavailable')">
      <p class="error">{{ t("reset.noMail") }}</p>
    </PanelBlock>

    <PanelBlock v-else-if="!token" :title="t('reset.badLink')">
      <p class="error">{{ t("reset.noToken") }}</p>
      <div class="actions"><LinkButton to="/account">{{ t("reset.backToAccount") }}</LinkButton></div>
    </PanelBlock>

    <PanelBlock v-else-if="done" :title="t('reset.doneTitle')">
      <p class="success">{{ t("reset.doneBody") }}</p>
      <div class="actions"><LinkButton to="/account" type="primary">{{ t("reset.goLogin") }}</LinkButton></div>
    </PanelBlock>

    <PanelBlock v-else :title="t('reset.formTitle')">
      <form class="form" @submit.prevent="submit">
        <FormField :label="t('account.newPassword')" :hint="t('auth.passwordHint')" required wide>
          <NInput v-model:value="password" type="password" show-password-on="click" />
        </FormField>
        <FormField :label="t('reset.confirm')" required wide>
          <NInput v-model:value="confirm" type="password" show-password-on="click" />
        </FormField>
        <div class="actions">
          <NButton attr-type="submit" type="primary" :loading="busy">{{ t("reset.formTitle") }}</NButton>
        </div>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </PanelBlock>
  </PageShell>
</template>

<style scoped>
.form { display: grid; gap: var(--sp-5); }
.actions { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.success { margin: 0 0 var(--sp-4); font-size: var(--fs-body); color: var(--accent-300); }
.error { margin: 0 0 var(--sp-4); font-size: var(--fs-body); color: var(--danger-400); }
</style>
