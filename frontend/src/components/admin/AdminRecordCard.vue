<script setup lang="ts">
/**
 * 审核队列里的一张记录卡。一张卡就是一条待办：标题、状态、视频入口在同一行，
 * 标签编辑与动作各占一行。
 *
 * 视频链接、时间、备注都在记录详情页的「管理编辑」里改，这里只给入口 ——
 * 同一组字段两处可改，迟早会出现「哪边是最新的」。
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { NButton } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import type { AdminRecord, AdminReviewState, ReviewTag } from "@shared/admin";
import { isRecordTrashed } from "@shared/admin";
import { catalog } from "@/lib/catalog";
import { challengeContext, playerName } from "@/lib/projection";
import { adminTrash } from "@/lib/admin-resources";
import LinkButton from "@/components/LinkButton.vue";
import AdminTagEditor from "@/components/admin/AdminTagEditor.vue";
import RecordOpinionEditor from "@/components/RecordOpinionEditor.vue";

const props = defineProps<{ record: AdminRecord; pending: boolean }>();
const emit = defineEmits<{
  changeTags: [tags: ReviewTag[]];
  appendTag: [tag: Omit<ReviewTag, "id">];
  review: [requested: "accepted" | "rejected"];
  restore: [];
  softDelete: [label: string];
  markReviewing: [];
}>();

const reviewLabels: Record<AdminReviewState, string> = {
  pending: "待审核", accepted: "已通过", rejected: "已拒绝", hidden: "已隐藏",
};

const context = computed(() => challengeContext(props.record.challengeId ?? 0));
const proposed = computed(() => props.record.proposedTarget);
const stateLabel = computed(() => (props.pending && props.record.reviewing ? "审核中" : reviewLabels[props.record.status]));
const stateClass = computed(() => (props.pending && props.record.reviewing ? "adm-state-reviewing" : `adm-state-${props.record.status}`));

/** 同一个人同一个挑战已经有记录时先说一声 —— 重复收录是最常见的审核失误。 */
const duplicates = computed(() => {
  if (!props.record.challengeId) return [];
  const pool = [...catalog.value.submissions, ...[props.record]];
  return [...new Map(pool.map((item) => [item.id, item])).values()]
    .filter((item) => item.id !== props.record.id
      && item.playerId === props.record.playerId
      && item.challengeId === props.record.challengeId
      && !isRecordTrashed(adminTrash.data.value, item.id));
});

const label = computed(() => `${playerName(props.record.playerId)} · ${context.value.label}`);
const appendTag = async (tag: Omit<ReviewTag, "id">) => { emit("appendTag", tag); return true; };
</script>

<template>
  <article class="card">
    <div class="main">
      <div class="title" :class="{ proposed: Boolean(proposed) }">
        <template v-if="proposed">
          <span class="name">{{ proposed.campaignName }}</span><span class="sep">·</span>
          <span class="name">{{ proposed.mapName }}</span><span class="sep">·</span>
          <span class="name">{{ proposed.challengeName }}</span>
          <a v-if="proposed.gameBananaUrl" :href="proposed.gameBananaUrl" target="_blank" rel="noreferrer">香蕉网资料 ↗</a>
        </template>
        <template v-else>
          <RouterLink :to="context.map ? `/map/${context.map.id}` : `/multi-challenge/${record.challengeId}`">
            {{ context.map?.name || context.campaign?.name || "多地图挑战" }}
          </RouterLink>
          <span class="sep">·</span>
          <RouterLink :to="context.challenge ? `/challenge/${record.challengeId}` : `/multi-challenge/${record.challengeId}`">
            {{ context.challenge?.name || context.multiChallenge?.name || record.challengeId }}
          </RouterLink>
        </template>
        <p class="meta">
          <RouterLink :to="`/player/${record.playerId}`">{{ playerName(record.playerId) }}</RouterLink>
          · {{ formatBeijingDateTime(record.achievedAt) || "未记录日期" }}
        </p>
        <p v-if="pending && record.reviewing" class="meta">
          {{ record.reviewing.by }} 正在审核{{ record.reviewing.note ? ` · ${record.reviewing.note}` : "" }}
        </p>
      </div>

      <span class="adm-state" :class="stateClass">{{ stateLabel }}</span>

      <div class="links">
        <NButton tag="a" :href="record.videoUrl" target="_blank" rel="noreferrer" type="primary" size="small">▶ 挑战视频</NButton>
        <NButton v-if="record.rawVideoUrl" tag="a" :href="record.rawVideoUrl" target="_blank" rel="noreferrer" quaternary size="small">RAW</NButton>
      </div>
    </div>

    <p v-if="duplicates.length" class="meta">
      提醒：此用户已有同样挑战的记录：
      <template v-for="(item, index) in duplicates" :key="item.id">
        <template v-if="index > 0">、</template>
        <RouterLink :to="`/record/${item.id}`" target="_blank">
          {{ formatBeijingDateTime(item.achievedAt) || "未记录日期" }}（{{ reviewLabels[item.status ?? "accepted"] }}）↗
        </RouterLink>
      </template>
    </p>

    <AdminTagEditor
      :tags="record.reviewTags || []"
      :on-change="(tags: ReviewTag[]) => emit('changeTags', tags)"
      :on-append="appendTag"
    />
    <RecordOpinionEditor v-if="!pending" :record="record" />

    <div class="adm-row-actions">
      <LinkButton :to="`/record/${record.id}`" size="small">挑战记录</LinkButton>
      <template v-if="pending">
        <NButton size="small" quaternary @click="emit('markReviewing')">{{ record.reviewing ? "审核中备注" : "标记审核中" }}</NButton>
        <NButton size="small" type="primary" @click="emit('review', 'accepted')">接受</NButton>
        <NButton size="small" type="error" @click="emit('review', 'rejected')">拒绝</NButton>
      </template>
      <template v-else>
        <NButton v-if="record.status === 'hidden'" size="small" type="primary" @click="emit('restore')">恢复显示</NButton>
        <NButton size="small" type="error" @click="emit('softDelete', label)">删除记录</NButton>
      </template>
    </div>
  </article>
</template>

<style scoped>
.card { display: grid; gap: var(--sp-3); padding: var(--sp-4); background: var(--bg-inset); border-radius: var(--r-md); }
.main { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(160px, auto); align-items: center; gap: var(--sp-4); }
.title { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
.title a { font-size: var(--fs-lead); font-weight: var(--fw-medium); }
.sep { color: var(--fg-disabled); }
/* 提案记录指向的地图／挑战还不存在，标题因此不是链接，也不该看起来像。 */
.proposed .name { font-size: var(--fs-lead); font-weight: var(--fw-medium); color: var(--fg-default); }
.meta { margin: var(--sp-1) 0 0; width: 100%; font-size: var(--fs-sm); color: var(--fg-subtle); }
.links { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2); flex-wrap: wrap; }

@media (max-width: 900px) {
  .main { grid-template-columns: 1fr; }
  .links { justify-content: flex-start; }
}
</style>
