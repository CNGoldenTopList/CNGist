<script setup lang="ts">
/** 找不到页面时的兜底界面。空屏是一次邀请，所以这里给一条出路。 */
import { useLanguage } from "@/i18n";
import PageShell from "@/components/PageShell.vue";
import LinkButton from "@/components/LinkButton.vue";

const { t } = useLanguage();
</script>

<template>
  <PageShell eyebrow="404" :title="t('notFound.title')" :lede="t('notFound.lede')">
    <div>
      <LinkButton to="/" type="primary">{{ t("notFound.home") }}</LinkButton>
    </div>
  </PageShell>
</template>
