<script setup lang="ts">
/**
 * 每日总结。当日通过的记录 + 当日新增的挑战，拼成一段可直接发群的文本。
 *
 * 新增挑战从审计日志里按「类型 + 日期」查，不把整张审计表拉到浏览器里再过滤。
 */
import { computed, ref, watch } from "vue";
import { NButton, NDatePicker, NInput } from "naive-ui";
import { beijingDate } from "@shared/datetime";
import { isRecordTrashed, type AdminRecord, type AuditItem, type TrashItem } from "@shared/admin";
import { catalog } from "@/lib/catalog";
import { challengeContext, playerName } from "@/lib/projection";
import { fetchAudit } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";

const props = defineProps<{ records: AdminRecord[]; trash: TrashItem[] }>();

const stamp = ref<number | null>(new Date(`${beijingDate()}T00:00:00+08:00`).getTime());
const date = computed(() => (stamp.value
  ? new Date(stamp.value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })
  : beijingDate()));

const created = ref<AuditItem[]>([]);
watch(date, async (value) => {
  created.value = (await fetchAudit({ from: value, to: value, type: "新建挑战", limit: 200 })).items;
}, { immediate: true });

const accepted = computed(() => {
  const queued = new Set(props.records.map((record) => record.id));
  const label = (playerId: number, challengeId: number) => `玩家 ${playerName(playerId)} 的 ${challengeContext(challengeId).label}`;
  return [
    ...catalog.value.submissions
      .filter((record) => record.achievedAt.startsWith(date.value) && !queued.has(record.id) && !isRecordTrashed(props.trash, record.id))
      .map((record) => label(record.playerId, record.challengeId)),
    ...props.records
      .filter((record) => record.status === "accepted"
        && !isRecordTrashed(props.trash, record.id)
        && (record.reviewedAt || record.achievedAt).startsWith(date.value))
      .map((record) => label(record.playerId, record.challengeId ?? 0)),
  ];
});

const createdToday = computed(() => created.value.map((item) => item.detail.split("\n")[0].replace(/^新建挑战\s*/, "")));

const summary = computed(() => [
  `${date.value} 更新日志：`,
  accepted.value.length ? accepted.value.join("\n") : "当日无通过挑战",
  "",
  "新增挑战：",
  createdToday.value.length ? createdToday.value.join("\n") : "当日无新增挑战",
].join("\n"));

async function copy() {
  try {
    await navigator.clipboard.writeText(summary.value);
    toast.success("每日总结已复制。");
  } catch {
    toast.error("复制失败，请手动选中文本。");
  }
}
</script>

<template>
  <PanelBlock title="每日总结">
    <template #actions>
      <NDatePicker v-model:value="stamp" type="date" class="date" aria-label="总结日期" />
    </template>
    <NInput :value="summary" type="textarea" readonly class="summary" aria-label="每日总结" />
    <div class="adm-actions">
      <NButton type="primary" @click="copy">复制每日总结</NButton>
    </div>
  </PanelBlock>
</template>

<style scoped>
.date { width: 150px; }
.summary { margin-bottom: var(--sp-4); }
.summary :deep(textarea) { min-height: 360px; line-height: var(--lh-body); font-family: var(--font-body); }
</style>
