<script setup lang="ts">
import { onMounted } from "vue";
import { fetchSiteConfig, siteConfig, siteConfigReady } from "@/lib/site-config";
import { playerHref } from "@/lib/routes";
import { useLanguage } from "@/i18n";

const { t } = useLanguage();
onMounted(() => { void fetchSiteConfig(); });
</script>

<template>
  <footer v-if="siteConfigReady" class="site-footer" :aria-label="t('home.siteInfo')">
    <dl class="credits">
      <div v-if="siteConfig.developers.length" class="credit">
        <dt>{{ t("home.developers") }}</dt>
        <dd class="people">
          <template v-for="(person, index) in siteConfig.developers" :key="index">
            <span v-if="index" class="separator">&amp;</span>
            <RouterLink v-if="person.playerId" :to="playerHref(person.playerId)">{{ person.name }}</RouterLink>
            <span v-else>{{ person.name }}</span>
          </template>
        </dd>
      </div>
      <div v-if="siteConfig.sponsorship" class="credit">
        <dt>{{ t("home.sponsorship") }}</dt>
        <dd>{{ siteConfig.sponsorship }}</dd>
      </div>
      <div class="credit administrators">
        <dt>{{ t("home.administrators") }}</dt>
        <dd class="people">
          <template v-for="(person, index) in siteConfig.administrators" :key="index">
            <span v-if="index" class="separator" aria-hidden="true">·</span>
            <RouterLink v-if="person.playerId" :to="playerHref(person.playerId)">{{ person.name }}</RouterLink>
            <span v-else>{{ person.name }}</span>
          </template>
          <span v-if="!siteConfig.administrators.length" class="empty">{{ t("home.noAdministrators") }}</span>
        </dd>
      </div>
      <div v-if="siteConfig.donation" class="credit external-link">
        <dt>{{ t("home.donation") }}</dt>
        <dd><a :href="siteConfig.donation.url" target="_blank" rel="noopener noreferrer">{{ siteConfig.donation.label }}</a></dd>
      </div>
      <div v-if="siteConfig.sourceUrl" class="credit external-link">
        <dt>{{ t("home.sourceUrl") }}</dt>
        <dd><a :href="siteConfig.sourceUrl" target="_blank" rel="noopener noreferrer">{{ siteConfig.sourceUrl }}</a></dd>
      </div>
    </dl>
    <div v-if="siteConfig.icpNumber" class="registration">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ siteConfig.icpNumber }}</a>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { border-top: var(--hairline); padding-top: var(--sp-5); font-size: var(--fs-sm); line-height: var(--lh-body); }
.credits { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--sp-5) var(--sp-6); margin: 0; padding-bottom: var(--sp-5); }
.credit { min-width: 0; }
.credit dt { color: var(--fg-subtle); margin-bottom: var(--sp-1); }
.credit dd { margin: 0; color: var(--fg-secondary); font-size: var(--fs-body); overflow-wrap: anywhere; }
.people { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); }
.administrators, .external-link { grid-column: 1 / -1; }
.separator, .empty { color: var(--fg-subtle); }
a { color: var(--link); text-decoration: none; }
a:hover, a:focus-visible { color: var(--link-hover); text-decoration: underline; text-underline-offset: 4px; }
.registration { border-top: var(--hairline); padding-top: var(--sp-3); text-align: center; }
.registration a { display: inline-block; padding: var(--sp-1) 0; color: var(--fg-subtle); }
.registration a:hover, .registration a:focus-visible { color: var(--link); }
@media (max-width: 640px) {
  .credits { grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
}
</style>
