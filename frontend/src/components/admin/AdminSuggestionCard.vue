<script setup lang="ts">
/** 一条意见的管理卡：控制投票窗口，以及给出同意／驳回的最终决定。 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NDatePicker, NInput } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import { suggestionDueAt, suggestionRemainingLabel } from "@shared/suggestions";
import { isRatedTier } from "@shared/tiers";
import type { Suggestion } from "@shared/types";
import { sendAdminCommand } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import TierBadge from "@/components/TierBadge.vue";
import TierSelect from "@/components/TierSelect.vue";
import FormField from "@/components/FormField.vue";
import AdminDeleteSuggestion from "@/components/admin/AdminDeleteSuggestion.vue";

const props = defineProps<{ item: Suggestion }>();

/** 常用的几档改期，省得为「再开三天」去点日历。负数是提前结束。 */
const EXTEND_PRESETS = [-3, -1, 1, 3, 7];

const due = computed(() => (props.item.kind === "GENERAL" ? undefined : suggestionDueAt(props.item.createdAt, props.item.dueAt)));
const note = ref("");
const resultTier = ref<string | null>(props.item.suggestedTier && isRatedTier(props.item.suggestedTier) ? props.item.suggestedTier : null);
const deadline = ref<number | null>(due.value ? due.value.getTime() : null);
const busy = ref(false);
const confirming = ref<"ACCEPTED" | "REJECTED" | null>(null);

const voting = computed(() => props.item.state === "ONGOING");

async function run(path: string, body: unknown, success: string) {
  busy.value = true;
  try {
    await sendAdminCommand(path, { body });
    toast.success(success);
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败。");
    return false;
  } finally {
    busy.value = false;
  }
}

const duration = (body: unknown, success: string) => run(`/api/admin/suggestions/${props.item.id}/duration`, body, success);

async function decide(decision: "ACCEPTED" | "REJECTED") {
  const ok = await run(`/api/admin/suggestions/${props.item.id}/decide`, {
    decision,
    note: note.value.trim(),
    resultTier: decision === "ACCEPTED" ? resultTier.value ?? "" : "",
  }, decision === "ACCEPTED" ? "意见已同意。" : "意见已驳回。");
  if (ok) confirming.value = null;
}

/** 截止时间按北京时间存成 `YYYY-MM-DD HH:mm`，与服务端一致。 */
function saveDeadline() {
  if (!deadline.value) return;
  const beijing = new Date(deadline.value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
  void duration({ dueAt: beijing.slice(0, 16) }, "投票截止时间已保存。");
}
</script>

<template>
  <article class="adm-card">
    <header class="adm-card-head">
      <span class="adm-card-title">
        <RouterLink :to="`/feedback?suggestion=${item.id}`">{{ item.title }}</RouterLink>
        <b>{{ item.author || "匿名" }}</b>
        <span v-if="item.currentTier && item.suggestedTier" class="tier-move">
          <TierBadge v-if="isRatedTier(item.currentTier)" :tier="item.currentTier" />
          →
          <TierBadge v-if="isRatedTier(item.suggestedTier)" :tier="item.suggestedTier" />
        </span>
      </span>
      <span class="adm-card-state" :class="{ 'adm-card-state-open': voting }">{{ voting ? "投票中" : "待决定" }}</span>
    </header>

    <p v-if="item.source === 'split'">将此地图的 C/FC 挑战拆分为独立的 C 和 FC 挑战。</p>
    <p class="adm-card-meta">
      支持 {{ item.votesFor }} · 反对 {{ item.votesAgainst }} · {{ suggestionRemainingLabel(due) || "没有截止时间" }}
      <template v-if="due"> · 截止 {{ formatBeijingDateTime(due.toISOString()) }}</template>
    </p>

    <section v-if="item.kind !== 'GENERAL'" class="adm-block">
      <h3 class="adm-block-title">投票时间</h3>
      <div class="adm-row-actions">
        <NButton
          v-for="days in EXTEND_PRESETS"
          :key="days"
          size="small"
          :disabled="busy"
          @click="duration({ extendDays: days }, days > 0 ? `已延长 ${days} 天。` : `已缩短 ${-days} 天。`)"
        >{{ days > 0 ? `+${days} 天` : `${days} 天` }}</NButton>
      </div>
      <div class="adm-form">
        <FormField label="直接指定截止时间" hint="北京时间；到期自动转入待决定，往后改能重新打开投票">
          <NDatePicker v-model:value="deadline" type="datetime" class="full" />
        </FormField>
        <div class="adm-row-actions">
          <NButton size="small" :disabled="busy || !deadline" @click="saveDeadline">保存截止时间</NButton>
        </div>
      </div>
    </section>

    <section class="adm-block">
      <h3 class="adm-block-title">最终决定</h3>
      <div class="adm-form">
        <FormField v-if="item.suggestedTier" label="结果难度" hint="同意时写入；票的结论常常不等于原提议">
          <TierSelect v-model="resultTier" placeholder="按原提议" aria-label="结果难度" />
        </FormField>
        <FormField label="决定说明" hint="会显示在意见箱的结论里" wide>
          <NInput v-model:value="note" type="textarea" :rows="2" />
        </FormField>
      </div>
      <!-- 决定是终态，改不回来，所以要二次确认。 -->
      <div class="adm-row-actions">
        <template v-if="confirming">
          <span class="confirm">确定{{ confirming === "ACCEPTED" ? "同意" : "驳回" }}这条意见？决定后不能再改。</span>
          <NButton size="small" :type="confirming === 'ACCEPTED' ? 'primary' : 'error'" :loading="busy" @click="decide(confirming)">确定</NButton>
          <NButton size="small" quaternary @click="confirming = null">取消</NButton>
        </template>
        <template v-else>
          <NButton size="small" type="primary" :disabled="busy" @click="confirming = 'ACCEPTED'">同意</NButton>
          <NButton size="small" type="error" :disabled="busy" @click="confirming = 'REJECTED'">驳回</NButton>
          <NButton size="small" quaternary tag="a" :href="`/feedback?suggestion=${item.id}`">看讨论</NButton>
          <AdminDeleteSuggestion :item="item" :disabled="busy" />
        </template>
      </div>
    </section>
  </article>
</template>

<style scoped>
.tier-move { display: inline-flex; align-items: center; gap: var(--sp-2); }
.confirm { font-size: var(--fs-sm); color: var(--fg-secondary); }
.full { width: 100%; }
</style>
