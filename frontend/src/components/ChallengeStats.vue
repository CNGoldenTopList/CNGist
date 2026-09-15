<script setup lang="ts">
/** 挑战的两块统计：推荐情况与难度建议。地图页、多地图挑战页、意见箱详情共用。 */
import { computed } from "vue";
import type { RatedTier, Submission } from "@shared/types";
import { recommendationStats } from "@/lib/stats";
import { useLanguage } from "@/i18n";
import RatioBar from "@/components/RatioBar.vue";
import TierOpinionPie from "@/components/TierOpinionPie.vue";

const props = defineProps<{ records: Submission[] }>();
const { t } = useLanguage();

const rec = computed(() => recommendationStats(props.records));
const opinions = computed(() => props.records.flatMap((record) => (record.opinionTier ? [record.opinionTier as RatedTier] : [])));
const segments = computed(() => [
  { value: rec.value.percent ?? 0, color: "var(--ok-600)", label: t("recommendation.yes") },
  { value: 100 - (rec.value.percent ?? 0), color: "var(--danger-600)", label: t("recommendation.no") },
]);
</script>

<template>
  <div class="grid">
    <section class="card">
      <h3 class="heading">{{ t("stats.recommendation") }}</h3>
      <div v-if="rec.total" class="rec">
        <div class="percent">
          <strong>{{ rec.percent }}%</strong>
          <span>{{ t("maps.recommendation") }}</span>
        </div>
        <div class="rec-body">
          <RatioBar :segments="segments" />
          <div class="counts">
            <span><i class="dot-yes" aria-hidden="true" />{{ t("recommendation.yes") }} <b>{{ rec.yes }}</b></span>
            <span><i class="dot-no" aria-hidden="true" />{{ t("recommendation.no") }} <b>{{ rec.no }}</b></span>
            <small>{{ t("stats.votes", { total: rec.total }) }}</small>
          </div>
        </div>
      </div>
      <p v-else class="empty">{{ t("stats.noRecommendation") }}</p>
    </section>

    <section class="card">
      <h3 class="heading">{{ t("stats.tierOpinion") }}</h3>
      <TierOpinionPie :opinions="opinions" />
    </section>
  </div>
</template>

<style scoped>
/* 两块并排的统计。用下沉一档的地面来分区，不画圆角描边卡片。 */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: var(--sp-4); }

.card {
  display: grid;
  gap: var(--sp-4);
  align-content: start;
  padding: var(--sp-5);
  background: var(--bg-inset);
  border-radius: var(--r-md);
  min-width: 0;
}

.heading { margin: 0; font-size: var(--fs-sm); font-weight: var(--fw-medium); letter-spacing: .04em; color: var(--fg-muted); }

/* 推荐率：一个大数字带住整块，右侧是比例条与明细 */
.rec { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--sp-5); }
.percent { display: grid; justify-items: center; gap: 2px; }
.percent strong {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: 2.25rem;
  font-weight: var(--fw-bold);
  line-height: 1;
  letter-spacing: -.03em;
  color: var(--fg-default);
}
.percent span { font-size: var(--fs-micro); color: var(--fg-subtle); }

.rec-body { display: grid; gap: var(--sp-3); min-width: 0; }

.counts { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-sm); color: var(--fg-secondary); }
.counts span { display: inline-flex; align-items: center; gap: var(--sp-2); }
.counts b { font-family: var(--font-num); font-variant-numeric: var(--num-tabular); font-weight: var(--fw-medium); color: var(--fg-default); }
.counts small { color: var(--fg-subtle); font-size: var(--fs-micro); }

.dot-yes, .dot-no { width: 8px; height: 8px; border-radius: 2px; }
.dot-yes { background: var(--ok-600); }
.dot-no { background: var(--danger-600); }

.empty { margin: 0; padding: var(--sp-5) 0; text-align: center; font-size: var(--fs-sm); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .card { padding: var(--sp-4); }
  .rec { grid-template-columns: 1fr; justify-items: start; gap: var(--sp-4); }
  .percent { justify-items: start; }
}
</style>
