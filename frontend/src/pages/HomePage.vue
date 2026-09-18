<script setup lang="ts">
/**
 * 首页。
 *
 * 视觉主体是 17 档 Tier 色谱 —— 那既是这个站的身份，也是它的数据模型本身。
 * 全站唯一一处允许 17 档 Tier 色同时铺开的地方：在这里它不是难度标注，
 * 而是这个站的自我介绍。
 */
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { NSkeleton } from "naive-ui";
import { standardMeta, standardOrder, tierMeta, tierOrder } from "@shared/tiers";
import type { TierCode } from "@shared/types";
import { api } from "@/lib/api";
import SiteFooter from "@/components/SiteFooter.vue";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import LinkButton from "@/components/LinkButton.vue";
import I18nMessage from "@/components/I18nMessage.vue";

const { t } = useLanguage();
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

type HomeStats = { campaigns: number; maps: number; players: number; records: number };
const stats = ref<HomeStats | null>(null);
const statsLoading = ref(true);
onMounted(async () => {
  const { ok, data } = await api.get<HomeStats>("/api/stats");
  if (ok) stats.value = data;
  statsLoading.value = false;
});

const term = computed(() => (compactTierLabels.value ? "T" : "Tier"));
const label = (tier: TierCode) => (compactTierLabels.value ? tierMeta[tier].short : tierMeta[tier].label);

const hardest = tierOrder[0];
const easiest = tierOrder[tierOrder.length - 1];

const items = computed(() => [
  { value: stats.value?.records, label: t("home.clears") },
  { value: stats.value?.players, label: t("common.players") },
  { value: stats.value?.campaigns, label: t("common.campaigns") },
  { value: stats.value?.maps, label: t("common.maps") },
]);

const tierGroups: Array<{ title: string; tiers: TierCode[] }> = [
  { title: "Tier -1", tiers: ["t-1"] },
  { title: "Tier 0", tiers: ["h0", "m0", "l0"] },
  { title: "Tier 1", tiers: ["h1", "m1", "l1"] },
  { title: "Tier 2", tiers: ["h2", "m2", "l2"] },
  { title: "Tier 3", tiers: ["h3", "m3", "l3"] },
  { title: "Tier 4–7", tiers: ["t4", "t5", "t6", "t7"] },
];

const videoRules = ["home.video1", "home.video2", "home.video3", "home.video4", "home.video5"] as const;
const mapRules = ["home.map1", "home.map2", "home.map3", "home.map4"] as const;
</script>

<template>
  <PageShell>
    <header class="hero">
      <p class="eyebrow">{{ t("home.community") }}</p>
      <h1 class="title">{{ t("brand.name") }}</h1>
      <p class="lede">{{ t("home.lede") }}</p>

      <!-- 17 档色谱：这个站的身份，也是它的数据模型 -->
      <div class="ramp" role="img" :aria-label="t('home.ramp', { hardest: label(hardest), easiest: label(easiest), count: tierOrder.length })">
        <i v-for="tier in tierOrder" :key="tier" :style="{ background: tierColors[tier] }" />
      </div>
      <p class="ramp-caption">
        <span>{{ label(hardest) }}</span>
        <span>{{ t("home.difficultyOrder") }}</span>
        <span>{{ label(easiest) }}</span>
      </p>

      <!-- 首页是 /farewell-golden 与 /qa 唯一的入口，缺一个就等于把那一页从站内藏起来。 -->
      <div class="actions">
        <LinkButton to="/golden" type="primary" size="large">{{ t("home.browse") }}</LinkButton>
        <LinkButton to="/maps" size="large">{{ t("nav.maps") }}</LinkButton>
        <LinkButton to="/farewell-golden" size="large">{{ t("home.farewell") }}</LinkButton>
        <LinkButton to="/submit" size="large">{{ t("common.submitChallenge") }}</LinkButton>
        <LinkButton to="/qa" size="large">{{ t("home.qaLink") }}</LinkButton>
      </div>

      <dl class="stats" :aria-busy="statsLoading">
        <div v-for="item in items" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>
            <NSkeleton v-if="statsLoading" width="4ch" height="1em" :sharp="false" :aria-label="t('common.loading')" />
            <template v-else>{{ item.value ?? "—" }}</template>
          </dd>
        </div>
      </dl>
    </header>

    <PanelBlock :title="t('home.scopeTitle')">
      <div class="prose">
        <p>{{ t("home.scope") }}</p>
        <p><I18nMessage id="home.scopeOther" /></p>
      </div>
    </PanelBlock>

    <PanelBlock :title="t('home.tiersTitle')">
      <div class="prose">
        <p>{{ t("home.tiers", { term, subtiers: compactTierLabels ? "T0–3" : "Tier 0–3" }) }}</p>
        <p class="standard-note">{{ t("home.standardTiers") }}</p>
      </div>
      <ul class="tiers">
        <li v-for="group in tierGroups" :key="group.title" class="tier-row">
          <strong>{{ compactTierLabels ? group.title.replace(/Tier\s*/, "T") : group.title }}</strong>
          <div class="chips">
            <span v-for="tier in group.tiers" :key="tier" class="chip" :style="{ '--chip': tierColors[tier] }">{{ label(tier) }}</span>
          </div>
        </li>
        <li class="tier-row">
          <strong>Standard</strong>
          <div class="chips">
            <span v-for="tier in standardOrder" :key="tier" class="chip" :style="{ '--chip': standardMeta[tier].color }">{{ standardMeta[tier].label }}</span>
          </div>
        </li>
      </ul>
    </PanelBlock>

    <PanelBlock :title="t('home.videoTitle')">
      <ol class="rules">
        <li v-for="key in videoRules" :key="key">{{ t(key, { term }) }}</li>
      </ol>
    </PanelBlock>

    <PanelBlock :title="t('home.mapTitle')">
      <ol class="rules">
        <li v-for="key in mapRules" :key="key">{{ t(key) }}</li>
      </ol>
    </PanelBlock>

    <PanelBlock :title="t('home.discussionTitle')">
      <div class="prose">
        <p>
          <I18nMessage id="home.discussion">
            <template #report><RouterLink to="/report">{{ t("home.report") }}</RouterLink></template>
            <template #feedback><RouterLink to="/feedback">{{ t("nav.feedback") }}</RouterLink></template>
          </I18nMessage>
        </p>
        <p>
          <I18nMessage id="home.qa">
            <template #link><RouterLink to="/qa">{{ t("home.qaLink") }}</RouterLink></template>
          </I18nMessage>
        </p>
        <p class="contact">
          <I18nMessage id="home.contact">
            <template #number><b>1021626096</b></template>
          </I18nMessage>
        </p>
      </div>
    </PanelBlock>
    <SiteFooter />
  </PageShell>
</template>

<style scoped>
.hero { display: grid; gap: var(--sp-4); }

.eyebrow {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}
.title {
  margin: 0;
  font-family: var(--font-title);
  font-size: clamp(2.5rem, 8vw, 3.5rem);
  font-weight: var(--fw-bold);
  line-height: .95;
  letter-spacing: -.035em;
  color: var(--fg-default);
}
.lede {
  margin: 0;
  max-width: 46ch;
  font-size: var(--fs-lead);
  line-height: var(--lh-body);
  color: var(--fg-secondary);
}

/* ── 难度色谱：17 段等宽铺满一整行，读得出「这是一条连续的阶梯」。 ── */
.ramp { display: flex; gap: 2px; height: 10px; margin-top: var(--sp-2); }
.ramp > i { display: block; flex: 1 1 0; border-radius: 1px; }

.ramp-caption {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  color: var(--fg-subtle);
}
.ramp-caption > span:nth-child(2) { letter-spacing: .1em; }

.actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-2); }

/* ── 数据概览：数字用等宽体压在标签上方，四项等宽排开。 ── */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
  margin: var(--sp-3) 0 0;
  padding-top: var(--sp-5);
  border-top: var(--hairline);
}
.stats > div { display: grid; gap: 2px; min-width: 0; }
.stats dt { font-size: var(--fs-micro); color: var(--fg-subtle); order: 2; }
.stats dd {
  margin: 0;
  order: 1;
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: 1;
  letter-spacing: -.02em;
  color: var(--fg-default);
}

.prose { display: grid; gap: var(--sp-4); }
.prose p { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }
.prose .standard-note { margin-bottom: var(--sp-3); }
.contact { font-family: var(--font-num); }
.contact b { color: var(--fg-default); font-variant-numeric: var(--num-tabular); }

/* ── 难度分级表 ──────────────────────────────────────────────
   档位名用色点标注，而不是整块填充 —— 这一段是说明，不该和金榜里
   真正承载难度信息的徽章抢同一种形态。 */
.tiers { margin: 0; padding: 0; list-style: none; display: grid; }
.tier-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--hairline);
}
.tier-row:last-child { border-bottom: 0; }
.tier-row strong { font-family: var(--font-num); font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
.chips { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.chip { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--fg-secondary); }
.chip::before { content: ""; width: 10px; height: 10px; border-radius: 2px; background: var(--chip); }

/* ── 规则条目：编号是有意义的，管理员审核时按条对照。 ── */
.rules { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-4); counter-reset: rule; }
.rules li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--sp-3);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--fg-secondary);
  counter-increment: rule;
}
.rules li::before {
  content: counter(rule, decimal-leading-zero);
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-micro);
  line-height: var(--lh-body);
  color: var(--fg-disabled);
}

@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, 1fr); gap: var(--sp-4) var(--sp-3); }
  .tier-row { grid-template-columns: 1fr; gap: var(--sp-2); }
}
</style>
