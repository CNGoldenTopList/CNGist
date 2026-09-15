<script setup lang="ts">
/**
 * 待审核与已审核队列。
 *
 * 审核结论、FC 徽章与同图冲突隐藏都在服务端的同一个事务里完成 —— 前端只发
 * 结论，不自己推导该隐藏谁。「审核中」只是给其他管理员的提示，不改审核状态。
 */
import { computed, ref, watch } from "vue";
import { NAutoComplete, NButton, NCheckbox, NInput, NModal, NSelect } from "naive-ui";
import type { AdminRecord, AdminReviewState, PlayerDirectory, ReviewTag } from "@shared/admin";
import type { PlayerStatus } from "@shared/types";
import { isStandardTier } from "@shared/tiers";
import { api } from "@/lib/api";
import { catalog } from "@/lib/catalog";
import { applyEffects, sendAdminCommand } from "@/lib/admin-resources";
import { confirmAction, toast } from "@/lib/feedback";
import AdminPager from "@/components/admin/AdminPager.vue";
import AdminRecordCard from "@/components/admin/AdminRecordCard.vue";
import TierSelect from "@/components/TierSelect.vue";
import type { ChallengeDraftPreview } from "@shared/challenge-draft";
import FormField from "@/components/FormField.vue";

const props = defineProps<{ records: AdminRecord[]; directory: PlayerDirectory; pending: boolean }>();

/*
 * 前端分页。已审核记录有上千条，一次全画出来单页要滚几十屏，卡片里的
 * 标签编辑器又都是活的组件。页长与后台其它列表一致。
 *
 * 两个队列共用这一个组件实例，所以换队列要回到第一页；页数缩短（审掉一条、
 * 或搜索收窄了结果）时只把页码夹回范围内 —— 审完一条就被弹回第一页，
 * 是这个页面最容易让人恼的事。
 */
const showStandard = ref(false);
const showNewChallenges = ref(false);
const standardChallengeIds = computed(() => new Set([
  ...catalog.value.challenges,
  ...catalog.value.multiMapChallenges,
].filter((challenge) => isStandardTier(challenge.tier)).map((challenge) => challenge.id)));
const visibleRecords = computed(() => {
  if (props.pending) return showNewChallenges.value ? props.records : props.records.filter(record => !record.proposedTarget);
  return showStandard.value ? props.records : props.records.filter(record =>
    !record.challengeId || !standardChallengeIds.value.has(record.challengeId));
});

const PAGE_SIZE = 20;
const page = ref(1);
const paged = computed(() => visibleRecords.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const pageCount = computed(() => Math.max(1, Math.ceil(visibleRecords.value.length / PAGE_SIZE)));

watch(() => props.pending, () => { page.value = 1; });
watch([showStandard, showNewChallenges], () => { page.value = 1; });
watch(pageCount, (count) => { if (page.value > count) page.value = count; });

const statusLabels: Record<PlayerStatus, string> = {
  unasked: "未询问", normal: "正常", unreplied: "未回复", unwilling: "不愿意入榜", blocked: "榜拒绝接受",
};

/** 「审核中」认领弹窗：claimed 表示这条记录已经被人（可能是别人）标记过。 */
const reviewing = ref<{ recordId: number; note: string; claimed: boolean } | null>(null);
/** 提案记录通过时要先指定归属到哪个既有挑战。 */
const placement = ref<{ recordId: number; status: "accepted" | "hidden"; campaignId: number | null; mapId: number | null; challengeId: number | null } | null>(null);

async function runCommand(path: string, init: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}, success?: string) {
  try {
    await sendAdminCommand(path, init);
    if (success) toast.success(success);
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    return false;
  }
}

async function patchRecord(recordId: number, patch: object) {
  const { ok, data } = await api.patch<{ record?: AdminRecord }>(`/api/admin/submissions/${recordId}`, patch);
  if (!ok || !data.record) { toast.error(data.error || "记录保存失败。"); return null; }
  await applyEffects("/api/admin/submissions");
  return data.record;
}

/** 改名、删除、拖动排序要整份数组一起写；单纯追加走下面的单条接口。 */
const changeTags = (recordId: number, tags: ReviewTag[]) => patchRecord(recordId, { reviewTags: tags });
const appendTag = (recordId: number, tag: Omit<ReviewTag, "id">) =>
  runCommand(`/api/admin/submissions/${recordId}/tags`, { body: tag }, "标签已追加。");

const finishReview = (recordId: number, status: AdminReviewState, retainedIds?: number[], challengeId?: number) =>
  runCommand(`/api/admin/submissions/${recordId}/review`, { body: { status, challengeId, retainedIds } });

const statusOf = (playerId: number) => props.directory.statuses[String(playerId)]
  || catalog.value.players.find((item) => item.id === playerId)?.status
  || "unasked";

function review(record: AdminRecord, requested: "accepted" | "rejected") {
  const playerStatus = statusOf(record.playerId);
  if (requested === "accepted" && (playerStatus === "unwilling" || playerStatus === "blocked")) {
    void finishReview(record.id, "rejected");
    toast.info(`该玩家状态为「${statusLabels[playerStatus]}」，记录已拒绝。`);
    return;
  }
  if (requested === "accepted" && record.proposedTarget) {
    placement.value = {
      recordId: record.id,
      status: playerStatus === "unreplied" ? "hidden" : "accepted",
      campaignId: null, mapId: null, challengeId: null,
    };
    return;
  }
  if (requested === "accepted" && playerStatus === "unreplied") {
    void finishReview(record.id, "hidden");
    toast.info("玩家尚未回复：记录已通过但保持隐藏。");
    return;
  }
  // 挑战 DAG 投影自己决定哪些前置记录被隐藏，不必让审核者去猜。
  void finishReview(record.id, requested);
}

async function setReviewing(recordId: number, active: boolean, note?: string) {
  const ok = await runCommand(`/api/admin/submissions/${recordId}/reviewing`, { body: { active, note } },
    active ? "已标记为审核中。" : "已取消审核中。");
  if (ok) reviewing.value = null;
}

async function softDelete(targetId: number, label: string) {
  const confirmed = await confirmAction({
    title: "移入回收站",
    content: `确认将「${label}」移入回收站？`,
    positiveText: "移入回收站",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void runCommand("/api/admin/trash", { body: { kind: "record", targetId } }, "已移入回收站。");
}

/* ── 归属弹窗的三级选择 ───────────────────────────────────── */
const campaignOptions = computed(() => catalog.value.campaigns.map((item) => ({ value: item.id, label: item.name })));
const mapOptions = computed(() => catalog.value.maps
  .filter((map) => map.campaignId === placement.value?.campaignId)
  .map((map) => ({ value: map.id, label: map.name })));
const challengeOptions = computed(() => catalog.value.challenges
  .filter((challenge) => challenge.mapId === placement.value?.mapId)
  .map((challenge) => ({ value: challenge.id, label: challenge.name })));

const challengePreview = ref<ChallengeDraftPreview | null>(null);
const draftMapOptions = computed(() => catalog.value.maps.filter(m => m.campaignId === challengePreview.value?.draft.campaignId).map(m => ({value:m.id,label:m.name})));
const draftComplete = computed(() => {
  const d = challengePreview.value?.draft;
  return d && d.campaignName.trim() && d.mapName.trim() && d.challengeName.trim() && d.gameBananaUrl.trim() && d.tier && d.type;
});
function selectDraftCampaign(id: number | null) {
  const d = challengePreview.value!.draft;
  d.campaignId=id; d.mapId=null;
  const pack=catalog.value.campaigns.find(c=>c.id===id);
  if(pack){d.campaignName=pack.name; d.gameBananaUrl=pack.gameBananaUrl || d.gameBananaUrl;}
}
function selectDraftMap(id: number | null) {
  const d=challengePreview.value!.draft; d.mapId=id;
  const map=catalog.value.maps.find(m=>m.id===id); if(map)d.mapName=map.name;
}
const autoBuilding = ref(false);
watch(() => placement.value?.recordId, () => { challengePreview.value = null; });

async function previewChallenge() {
  const current = placement.value;
  if (!current || autoBuilding.value) return;
  autoBuilding.value = true;
  try {
    const { ok, data } = await api.post<{ data?: ChallengeDraftPreview }>(`/api/admin/submissions/${current.recordId}/auto-challenge`, {});
    if (!ok || !data.data) throw new Error(data.error || "匹配预览失败。");
    if (placement.value?.recordId === current.recordId) challengePreview.value = data.data;
  } catch (cause) { toast.error(cause instanceof Error ? cause.message : "匹配预览失败。"); }
  finally { autoBuilding.value = false; }
}

async function createPreviewedChallenge() {
  const current = placement.value, preview = challengePreview.value;
  if (!current || !preview || autoBuilding.value) return;
  autoBuilding.value = true;
  try {
    const result = await sendAdminCommand<{ campaignId: number; mapId: number; challengeId: number }>(
      `/api/admin/submissions/${current.recordId}/auto-challenge`, { body: { confirm: true, token: preview.token, draft: preview.draft } });
    if (!result) throw new Error("建立挑战失败。");
    if (placement.value?.recordId === current.recordId) {
      placement.value = { ...current, campaignId: result.campaignId, mapId: result.mapId, challengeId: result.challengeId };
      challengePreview.value = null;
      toast.success("挑战已建立或复用，并已预填归属。请确认接受记录。");
    }
  } catch (cause) { toast.error(cause instanceof Error ? cause.message : "建立挑战失败。"); }
  finally { autoBuilding.value = false; }
}

async function confirmPlacement() {
  const current = placement.value;
  if (!current?.challengeId) return;
  if (!await finishReview(current.recordId, current.status, undefined, current.challengeId)) return;
  toast.success(current.status === "hidden" ? "记录已通过并按玩家状态保持隐藏。" : "记录已通过并归入所选挑战项目。");
  placement.value = null;
}

const emptyText = computed(() => (props.pending ? "当前没有符合条件的待审核记录。" : "暂无已审核记录。"));
</script>

<template>
  <div class="adm-section">
    <NCheckbox v-if="pending" v-model:checked="showNewChallenges">显示新挑战</NCheckbox>
    <NCheckbox v-else v-model:checked="showStandard">显示 Standard 挑战</NCheckbox>
    <AdminRecordCard
      v-for="record in paged"
      :key="record.id"
      :record="record"
      :pending="pending"
      @change-tags="(tags) => changeTags(record.id, tags)"
      @append-tag="(tag) => appendTag(record.id, tag)"
      @review="(requested) => review(record, requested)"
      @restore="finishReview(record.id, 'accepted')"
      @soft-delete="(label) => softDelete(record.id, label)"
      @mark-reviewing="reviewing = { recordId: record.id, note: record.reviewing?.note || '', claimed: Boolean(record.reviewing) }"
    />
    <p v-if="!visibleRecords.length" class="adm-empty">{{ emptyText }}</p>
    <AdminPager v-model:page="page" :item-count="visibleRecords.length" :page-size="PAGE_SIZE" />

    <NModal
      :show="Boolean(reviewing)"
      preset="card"
      title="标记为审核中"
      :bordered="false"
      style="max-width: 460px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) reviewing = null; }"
    >
      <template #header-extra>
        <span class="subtitle">只提醒其他管理员这条已经有人在看，不改变审核状态，玩家也看不到。</span>
      </template>
      <div v-if="reviewing" class="adm-form">
        <FormField label="备注" hint="可留空，例如「等作者补 RAW」" wide>
          <NInput v-model:value="reviewing.note" type="textarea" :rows="3" :maxlength="500" autofocus />
        </FormField>
      </div>
      <template #footer>
        <div class="foot">
          <NButton v-if="reviewing?.claimed" quaternary @click="setReviewing(reviewing.recordId, false)">取消审核中</NButton>
          <NButton v-if="reviewing" type="primary" @click="setReviewing(reviewing.recordId, true, reviewing.note)">
            {{ reviewing.claimed ? "保存备注" : "标记审核中" }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="Boolean(placement)"
      preset="card"
      title="接收新地图或挑战记录"
      :closable="!autoBuilding" :mask-closable="!autoBuilding" :close-on-esc="!autoBuilding"
      :bordered="false"
      style="max-width: 640px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) placement = null; }"
    >
      <p class="subtitle placement-subtitle">选择现有归属；审核成功后的记录将使用这里选择的地图包、地图和挑战项目。</p>
      <div v-if="placement" class="adm-form">
        <FormField label="地图包">
          <NSelect
            :value="placement.campaignId"
            :options="campaignOptions"
            filterable
            clearable
            placeholder="请选择地图包"
            aria-label="地图包"
            @update:value="(value: number | null) => placement = { ...placement!, campaignId: value, mapId: null, challengeId: null }"
          />
        </FormField>
        <FormField label="地图">
          <NSelect
            :value="placement.mapId"
            :options="mapOptions"
            filterable
            clearable
            :disabled="!placement.campaignId"
            placeholder="请选择地图"
            aria-label="地图"
            @update:value="(value: number | null) => placement = { ...placement!, mapId: value, challengeId: null }"
          />
        </FormField>
        <FormField label="挑战项目" wide>
          <NSelect
            :value="placement.challengeId"
            :options="challengeOptions"
            filterable
            clearable
            :disabled="!placement.mapId"
            placeholder="请选择挑战项目"
            aria-label="挑战项目"
            @update:value="(value: number | null) => placement = { ...placement!, challengeId: value }"
          />
        </FormField>
      </div>
      <template #footer>
        <div class="foot placement-foot">
          <NButton class="auto-action" :loading="autoBuilding" @click="previewChallenge">尝试自动建立挑战</NButton>
          <NButton quaternary :disabled="autoBuilding" @click="placement = null">取消</NButton>
          <NButton type="primary" :disabled="!placement?.challengeId || autoBuilding" @click="confirmPlacement">确认接受</NButton>
        </div>
      </template>
    </NModal>
    <NModal :show="Boolean(challengePreview)" preset="card" title="自动建立挑战预览" :bordered="false"
      :closable="!autoBuilding" :mask-closable="!autoBuilding" :close-on-esc="!autoBuilding"
      style="max-width: 640px; width: calc(100vw - 32px)"
      @update:show="(value: boolean) => { if (!value) challengePreview = null; }">
      <div v-if="challengePreview" class="adm-form">
        <p v-for="note in challengePreview.notes" :key="note" class="subtitle preview-note">{{ note }}</p>
        <FormField label="现有地图包" hint="留空则按名称和链接新建或复用。">
          <NSelect :value="challengePreview.draft.campaignId" :options="campaignOptions" filterable clearable placeholder="新建地图包" @update:value="selectDraftCampaign" />
        </FormField>
        <FormField label="地图包名称" required>
          <NInput v-model:value="challengePreview.draft.campaignName" :disabled="Boolean(challengePreview.draft.campaignId)" :maxlength="300" />
        </FormField>
        <FormField label="GameBanana 链接" wide required>
          <NInput v-model:value="challengePreview.draft.gameBananaUrl" placeholder="https://gamebanana.com/mods/…" />
        </FormField>
        <FormField label="现有地图" hint="留空则按名称新建或复用。">
          <NSelect :value="challengePreview.draft.mapId" :options="draftMapOptions" :disabled="!challengePreview.draft.campaignId" filterable clearable placeholder="新建地图" @update:value="selectDraftMap" />
        </FormField>
        <FormField label="地图名称" required hint="可输入名称，或选择缓存中的地图。">
          <NAutoComplete v-model:value="challengePreview.draft.mapName" :options="challengePreview.sourceMapNames" :disabled="Boolean(challengePreview.draft.mapId)" />
        </FormField>
        <FormField label="挑战名称" required>
          <NInput v-model:value="challengePreview.draft.challengeName" :maxlength="300" />
        </FormField>
        <FormField label="挑战类型" required>
          <NSelect v-model:value="challengePreview.draft.type" :options="['C','FC','C/FC','All Major Secrets','Silver Segment','Other'].map(value=>({value,label:value}))" placeholder="请选择类型" />
        </FormField>
        <FormField label="难度" required :hint="challengePreview.sourceDifficulty ? `Goldberries：${challengePreview.sourceDifficulty}` : '请核对；尚未确定时可选择未定档。'">
          <TierSelect v-model="challengePreview.draft.tier" />
        </FormField>
        <FormField label="挑战规则" wide>
          <NInput v-model:value="challengePreview.draft.rules" type="textarea" :rows="3" :maxlength="4000" />
        </FormField>
        <FormField v-if="challengePreview.sourceUrl" label="匹配来源" wide>
          <a :href="challengePreview.sourceUrl" target="_blank" rel="noopener noreferrer">{{ challengePreview.sourceObjective }} · Goldberries 挑战页面</a>
        </FormField>
        <p class="subtitle preview-note">确认后按以上资料建立或复用归属并回填，记录仍待审核。</p>
      </div>
      <template #footer>
        <div class="foot">
          <NButton quaternary :disabled="autoBuilding" @click="challengePreview = null">返回</NButton>
          <NButton type="primary" :loading="autoBuilding" :disabled="!draftComplete" @click="createPreviewedChallenge">确认建立并回填</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.subtitle { font-size: var(--fs-sm); color: var(--fg-subtle); }
.placement-subtitle { margin: 0 0 var(--sp-4); }
.placement-foot { flex-wrap: wrap; }
.auto-action { margin-right: auto; }
.preview-note { grid-column: 1 / -1; margin: 0; }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
