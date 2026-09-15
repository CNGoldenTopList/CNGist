<script setup lang="ts">
/**
 * 投票明细：三列人名。评论直接列出，不藏在 hover 气泡里 —— 触摸屏上摸不到。
 * 三列各用自己的语义色收一条底线，不做整块填充。
 */
import { computed } from "vue";
import type { SuggestionResponse } from "@shared/types";
import { useLanguage } from "@/i18n";
import type { Tally } from "@/components/VoteBar.vue";

const props = defineProps<{ title: string; responses: SuggestionResponse[]; archive?: Tally }>();
const { t } = useLanguage();

const cols = computed(() => [
  { key: "FOR" as const, label: t("feedback.for"), cls: "col-yes", count: props.archive?.yes },
  { key: "AGAINST" as const, label: t("feedback.against"), cls: "col-no", count: props.archive?.no },
  { key: "INDIFFERENT" as const, label: t("feedback.neutral"), cls: "col-neutral", count: props.archive?.neutral },
]);

const itemsFor = (key: string) => props.responses.filter((response) => response.vote === key);
</script>

<template>
  <section class="cohort">
    <h3 class="cohort-title">{{ title }}</h3>
    <div class="cohort-cols">
      <div v-for="col in cols" :key="col.key" class="col" :class="col.cls">
        <div class="col-head">
          <span>{{ col.label }}</span>
          <strong>{{ col.count ?? itemsFor(col.key).length }}</strong>
        </div>
        <ul class="people">
          <li v-for="(response, index) in itemsFor(col.key)" :key="`${response.player}-${index}`">
            <b>{{ response.player }}</b>
            <q v-if="response.comment">{{ response.comment }}</q>
          </li>
          <li v-if="!itemsFor(col.key).length" class="people-empty">—</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cohort { display: grid; gap: var(--sp-3); }
.cohort-title {
  margin: 0;
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  font-family: var(--font-title);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
}
.cohort-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4); }
.col { display: grid; gap: var(--sp-3); align-content: start; min-width: 0; }

.col-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  padding-bottom: var(--sp-2);
  border-bottom: 2px solid var(--col-tone, var(--border-default));
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.col-head strong {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-tabular);
  font-size: var(--fs-lead);
  color: var(--fg-default);
}
.col-yes { --col-tone: var(--ok-600); }
.col-no { --col-tone: var(--danger-600); }
.col-neutral { --col-tone: var(--n-600); }

.people { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-3); }
.people li { display: grid; gap: 2px; min-width: 0; }
.people b { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-secondary); overflow-wrap: anywhere; }
.people q { font-size: var(--fs-micro); line-height: var(--lh-snug); color: var(--fg-subtle); quotes: "「" "」"; }
.people-empty { font-size: var(--fs-sm); color: var(--fg-disabled); }

@media (max-width: 640px) {
  .cohort-cols { grid-template-columns: 1fr; }
}
</style>
