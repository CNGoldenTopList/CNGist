<script setup lang="ts">
/**
 * CNGoldenLink 安装说明。
 *
 * 版本与下载地址在构建时固定（scripts/fetch-cngoldenlink-release.mjs），
 * 运行时不去请求 GitHub —— 国内访问不该依赖它。
 */
import release from "@/generated/cngoldenlink-release.json";
import { NButton } from "naive-ui";
import { useLanguage } from "@/i18n";
import PageShell from "@/components/PageShell.vue";
import LinkButton from "@/components/LinkButton.vue";

const { t } = useLanguage();
const { version, downloadUrl } = release;
</script>

<template>
  <PageShell :title="t('player.modInstallTitle')" :lede="t('install.lede')">
    <div class="download">
      <strong>CNGoldenLink {{ version }}</strong>
      <p>{{ t("install.dependency") }}</p>
      <NButton tag="a" :href="downloadUrl" type="primary">{{ t("install.download", { version }) }}</NButton>
      <a class="url" :href="downloadUrl">{{ downloadUrl }}</a>
    </div>

    <ol class="steps">
      <li>
        <h2>{{ t("install.prepareTitle") }}</h2>
        <p>{{ t("install.prepare") }}</p>
        <p>{{ t("install.cct") }}</p>
      </li>
      <li>
        <h2>{{ t("install.filesTitle") }}</h2>
        <p>{{ t("install.files", { filename: `CNGoldenLink-${version}.zip` }) }}</p>
        <p>{{ t("install.update") }}</p>
      </li>
      <li>
        <h2>{{ t("install.connectTitle") }}</h2>
        <p>{{ t("install.connect") }}</p>
      </li>
      <li>
        <h2>{{ t("install.verifyTitle") }}</h2>
        <p>{{ t("install.verify") }}</p>
        <LinkButton to="/account">{{ t("install.account") }}</LinkButton>
      </li>
    </ol>

    <section class="help" aria-labelledby="install-overlay">
      <h2 id="install-overlay">{{ t("install.overlayTitle") }}</h2>
      <p>{{ t("install.overlayIntro") }}</p>
      <ol class="steps">
        <li>
          <p>{{ t("install.overlayEnable") }}</p>
          <code class="url">http://localhost:32272/</code>
        </li>
        <li>
          <p>{{ t("install.overlaySource") }}</p>
          <code class="url">http://localhost:32272/apex?obs=1</code>
          <code class="url">http://localhost:32272/orbit?obs=1</code>
        </li>
        <li><p>{{ t("install.overlayGame") }}</p></li>
        <li><p>{{ t("install.overlayChallenge") }}</p></li>
      </ol>
      <p>{{ t("install.overlayStats") }}</p>
      <p>{{ t("install.overlayLocal") }}</p>
    </section>

    <section class="help" aria-labelledby="install-help">
      <h2 id="install-help">{{ t("install.helpTitle") }}</h2>
      <p>{{ t("install.missing") }}</p>
      <p>{{ t("install.auth") }}</p>
      <p>{{ t("install.overlayTroubleshooting") }}</p>
    </section>
  </PageShell>
</template>

<style scoped>
/* 下载块是这一页唯一的行动点，下沉一档地面把它托起来。 */
.download { display: grid; justify-items: start; gap: var(--sp-2); padding: var(--sp-5); background: var(--bg-inset); border-radius: var(--r-md); }
.download strong { font-family: var(--font-title); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--fg-default); }

.download p,
.steps p,
.help p { margin: 0 0 var(--sp-3); color: var(--fg-secondary); line-height: var(--lh-body); }

.url { display: block; margin-top: var(--sp-2); overflow-wrap: anywhere; font-size: var(--fs-sm); }
code.url { font-family: var(--font-num); color: var(--fg-muted); }

/* 编号是有意义的：安装要按顺序做。 */
.steps { padding-left: var(--sp-5); margin: 0; display: grid; gap: var(--sp-5); }
.steps li { padding-left: var(--sp-2); }
.steps h2,
.help h2 { margin: 0 0 var(--sp-2); font-family: var(--font-title); font-size: var(--fs-h3); font-weight: var(--fw-medium); color: var(--fg-default); }

.help { border-top: var(--hairline); padding-top: var(--sp-5); display: grid; gap: var(--sp-3); }
</style>
