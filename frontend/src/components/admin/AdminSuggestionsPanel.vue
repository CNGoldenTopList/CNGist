<script setup lang="ts">
/** 意见箱管理。默认停在「待决定」：那批是真正卡着等管理员动作的。 */
import { computed, ref } from "vue";
import { NButton, NTab, NTabs } from "naive-ui";
import { isRatedTier, tierBadgeLabel } from "@shared/tiers";
import { catalog } from "@/lib/catalog";
import AdminSuggestionCard from "@/components/admin/AdminSuggestionCard.vue";
import AdminDeleteSuggestion from "@/components/admin/AdminDeleteSuggestion.vue";

const filter = ref<"undecided" | "ongoing" | "decided">("undecided");

const groups = computed(() => {
  const all = catalog.value.suggestions;
  return {
    undecided: all.filter((item) => item.state === "UNDECIDED"),
    ongoing: all.filter((item) => item.state === "ONGOING"),
    decided: all.filter((item) => item.state === "DECIDED"),
  };
});
</script>

<template>
  <div class="panel">
    <NTabs justify-content="space-around" show-scroll-button v-model:value="filter" type="line" size="small" class="tabs" aria-label="意见状态">
      <NTab name="undecided">待决定 {{ groups.undecided.length || "" }}</NTab>
      <NTab name="ongoing">投票中 {{ groups.ongoing.length || "" }}</NTab>
      <NTab name="decided">已决定</NTab>
    </NTabs>

    <ul v-if="filter === 'decided'" class="adm-list">
      <li v-for="item in groups.decided" :key="item.id" class="adm-row">
        <div class="adm-row-main">
          <span class="adm-row-kind">
            {{ item.decision === "ACCEPTED" ? "已同意" : "已驳回" }}
            <template v-if="item.resultTier && isRatedTier(item.resultTier)"> · 结果 {{ tierBadgeLabel(item.resultTier) }}</template>
          </span>
          <span class="adm-row-title">{{ item.title }}</span>
          <p v-if="item.decisionNote" class="adm-row-detail">{{ item.decisionNote }}</p>
        </div>
        <div class="adm-row-actions">
          <NButton size="small" quaternary tag="a" :href="`/feedback?suggestion=${item.id}`">打开</NButton>
          <AdminDeleteSuggestion :item="item" />
        </div>
      </li>
      <p v-if="!groups.decided.length" class="adm-empty">还没有决定过的意见。</p>
    </ul>

    <div v-else class="adm-section">
      <AdminSuggestionCard v-for="item in groups[filter]" :key="item.id" :item="item" />
      <p v-if="!groups[filter].length" class="adm-empty">
        {{ filter === "undecided" ? "没有等待决定的意见。" : "当前没有正在投票的意见。" }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.panel { display: grid; gap: var(--sp-5); }
.tabs { max-width: 360px; }
</style>
