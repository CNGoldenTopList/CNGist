<script setup lang="ts">
/**
 * 个人页上「审核中 / 已拒绝」的自有提交。
 *
 * 这两类记录不进公开投影，所以只能单独取一次：`GET /api/submissions` 按会话
 * 认领的玩家返回。被拒绝的记录带审核意见，玩家照着改完就能重新送审；任何
 * 状态都能撤回，撤回后进回收站。只有本人看得到这一块。
 */
import { computed, onMounted, ref } from "vue";
import { NButton, NDatePicker, NInput, NModal } from "naive-ui";
import { formatDate } from "@shared/datetime";
import { challengeDisplayName } from "@shared/labels";
import { api } from "@/lib/api";
import { fetchCatalog } from "@/lib/catalog";
import { challengeContext } from "@/lib/projection";
import { useLanguage } from "@/i18n";
import { toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";
import CampaignAutocomplete from "@/components/CampaignAutocomplete.vue";
import { validGameBananaUrl } from "@shared/gamebanana";
import FormField from "@/components/FormField.vue";
import WithdrawSubmission from "@/components/WithdrawSubmission.vue";

type ProposedTarget = { campaignName?: string; mapName?: string; challengeName?: string; gameBananaUrl?: string; rules?: string; suggestedTier?: string };
type OwnSubmission = {
  id: number; playerId: number; challengeId: number; status: string; videoUrl: string;
  rawVideoUrl?: string; achievedAt: string; duration?: string; playerNote?: string;
  verifierNote?: string; createdAt: string; proposedTarget?: ProposedTarget;
};

const { t, locale, apiError } = useLanguage();

const records = ref<OwnSubmission[]>([]);
const editing = ref<OwnSubmission | null>(null);
const busy = ref(false);
const error = ref("");

const draft = ref({
  videoUrl: "", rawVideoUrl: "", achievedAt: "", duration: "", playerNote: "",
  campaignName: "", mapName: "", challengeName: "", gameBananaUrl: "", rules: "",
});

async function load() {
  const { ok, data } = await api.get<{ records?: OwnSubmission[] }>("/api/submissions");
  // 取不到就当没有，这一块不该挡住整张个人页。
  records.value = ok ? data.records ?? [] : [];
}
onMounted(load);

function label(record: OwnSubmission) {
  if (record.proposedTarget) {
    return [record.proposedTarget.campaignName, record.proposedTarget.mapName, record.proposedTarget.challengeName].filter(Boolean).join(" · ");
  }
  const context = challengeContext(record.challengeId);
  const target = context.challenge ? challengeDisplayName(context.challenge) : context.multiChallenge?.name;
  return [context.map?.name || context.campaign?.name, target].filter(Boolean).join(" · ") || String(record.challengeId);
}

function openEditor(record: OwnSubmission) {
  editing.value = record;
  error.value = "";
  draft.value = {
    videoUrl: record.videoUrl, rawVideoUrl: record.rawVideoUrl ?? "", achievedAt: record.achievedAt,
    duration: record.duration ?? "", playerNote: record.playerNote ?? "",
    campaignName: record.proposedTarget?.campaignName ?? "", mapName: record.proposedTarget?.mapName ?? "",
    challengeName: record.proposedTarget?.challengeName ?? "", gameBananaUrl: record.proposedTarget?.gameBananaUrl ?? "",
    rules: record.proposedTarget?.rules ?? "",
  };
}

const achievedAtStamp = computed({
  get: () => (draft.value.achievedAt ? new Date(`${draft.value.achievedAt}T00:00:00+08:00`).getTime() : null),
  set: (value: number | null) => {
    draft.value.achievedAt = value ? new Date(value).toISOString().slice(0, 10) : "";
  },
});

async function resubmit() {
  const record = editing.value;
  if (!record) return;
  if (record.proposedTarget && !validGameBananaUrl(draft.value.gameBananaUrl)) { error.value = t("error.gameBananaInvalid"); return; }
  busy.value = true;
  error.value = "";
  const payload = {
    videoUrl: draft.value.videoUrl.trim(),
    rawVideoUrl: draft.value.rawVideoUrl.trim(),
    achievedAt: draft.value.achievedAt,
    duration: draft.value.duration.trim(),
    playerNote: draft.value.playerNote.trim(),
    ...(record.proposedTarget ? {
      proposedTarget: {
        campaignName: draft.value.campaignName.trim(),
        mapName: draft.value.mapName.trim(),
        challengeName: draft.value.challengeName.trim(),
        gameBananaUrl: draft.value.gameBananaUrl.trim(),
        rules: draft.value.rules.trim(),
        suggestedTier: record.proposedTarget.suggestedTier,
      },
    } : {}),
  };
  const { ok, data } = await api.patch<{ record?: OwnSubmission }>(`/api/submissions/${record.id}`, payload);
  busy.value = false;
  if (!ok) { error.value = apiError(data, "submit.failed"); return; }
  // Std 挑战直接落库，目录要跟着刷新。
  if (data.record?.status === "accepted") void fetchCatalog(true);
  editing.value = null;
  toast.success(t(data.record?.status === "accepted" ? "submit.standardDone" : "player.resubmitDone"));
  await load();
}
</script>

<template>
  <PanelBlock v-if="records.length" :title="t('player.reviewQueue')" :subtitle="t('player.reviewQueueHint')">
    <ul class="list">
      <li v-for="record in records" :key="record.id" class="item">
        <div class="head">
          <strong class="name">{{ label(record) }}</strong>
          <span class="state" :data-tone="record.status === 'rejected' ? 'rejected' : 'pending'">
            {{ t(record.status === "rejected" ? "record.statusRejected" : "record.statusPending") }}
          </span>
        </div>
        <p class="meta">{{ t("player.submittedAt", { date: formatDate(record.createdAt.slice(0, 10), locale) }) }}</p>
        <p v-if="record.verifierNote" class="note"><span>{{ t("player.reviewNote") }}</span>{{ record.verifierNote }}</p>
        <div class="actions">
          <NButton tag="a" :href="record.videoUrl" target="_blank" rel="noreferrer" size="small" quaternary>{{ t("record.video") }}</NButton>
          <NButton size="small" @click="openEditor(record)">{{ t("player.editSubmission") }}</NButton>
          <WithdrawSubmission :record-id="record.id" :player-id="record.playerId" :on-done="load" />
        </div>
      </li>
    </ul>

    <NModal
      :show="Boolean(editing)"
      preset="card"
      :title="t('player.editSubmission')"
      :bordered="false"
      style="max-width: 640px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) editing = null; }"
    >
      <template #header-extra><span class="subtitle">{{ editing ? label(editing) : "" }}</span></template>
      <div v-if="editing" class="form">
        <template v-if="editing.proposedTarget">
          <FormField :label="t('submit.campaignName')" required>
            <CampaignAutocomplete :key="editing?.id" v-model:value="draft.campaignName" v-model:game-banana-url="draft.gameBananaUrl" />
          </FormField>
          <FormField :label="t('submit.mapName')" required>
            <NInput v-model:value="draft.mapName" />
          </FormField>
          <FormField :label="t('submit.challengeName')" required wide>
            <NInput v-model:value="draft.challengeName" />
          </FormField>
          <FormField :label="t('submit.gameBanana')" :hint="t('submit.gameBananaHint')" required wide>
            <NInput v-model:value="draft.gameBananaUrl" />
          </FormField>
          <FormField :label="t('submit.rules')" :hint="t('submit.optional')" wide>
            <NInput v-model:value="draft.rules" type="textarea" :rows="4" />
          </FormField>
        </template>
        <FormField :label="t('submit.videoRun')" :hint="t('submit.bvHint')" required wide>
          <NInput v-model:value="draft.videoUrl" :placeholder="t('submit.videoPlaceholder')" />
        </FormField>
        <FormField :label="t('submit.rawVideo')" :hint="t('submit.rawHint')" wide>
          <NInput v-model:value="draft.rawVideoUrl" :placeholder="t('submit.videoPlaceholder')" />
        </FormField>
        <FormField :label="t('record.achievedAt')">
          <NDatePicker v-model:value="achievedAtStamp" type="date" class="full" />
        </FormField>
        <FormField :label="t('record.duration')" :hint="t('submit.optional')">
          <NInput v-model:value="draft.duration" :placeholder="t('submit.durationPlaceholder')" />
        </FormField>
        <FormField :label="t('record.playerNote')" :hint="t('submit.playerNoteHint')" wide>
          <NInput v-model:value="draft.playerNote" type="textarea" :rows="4" />
        </FormField>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <div class="modal-foot">
          <NButton quaternary @click="editing = null">{{ t("common.cancel") }}</NButton>
          <NButton type="primary" :loading="busy" @click="resubmit">{{ t("player.editSubmission") }}</NButton>
        </div>
      </template>
    </NModal>
  </PanelBlock>
</template>

<style scoped>
.list { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-2); }
.item { display: grid; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); background: var(--bg-inset); border-radius: var(--r-md); }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.name { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: anywhere; }

/* 已拒绝用危险色，待审核用交互蓝：状态本身就是这一块唯一要一眼读到的信息。 */
.state {
  font-size: var(--fs-micro);
  padding: 1px var(--sp-2);
  border-radius: var(--r-sm);
  border: 1px solid var(--accent-400);
  color: var(--accent-400);
  white-space: nowrap;
}
.state[data-tone="rejected"] { border-color: var(--danger-400); color: var(--danger-400); }

.meta { margin: 0; font-size: var(--fs-micro); color: var(--fg-subtle); }
.note { margin: 0; font-size: var(--fs-sm); color: var(--fg-secondary); overflow-wrap: anywhere; }
.note span { color: var(--fg-subtle); margin-right: var(--sp-2); }
.actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3) var(--sp-4); }
.error { margin: 0; grid-column: 1 / -1; font-size: var(--fs-sm); color: var(--danger-400); }
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.modal-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
.full { width: 100%; }

@media (max-width: 640px) {
  .form { grid-template-columns: minmax(0, 1fr); }
}
</style>
