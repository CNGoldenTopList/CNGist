<script setup lang="ts">
/**
 * 提交中心。
 *
 * 三条与旧版不同的行为，改的时候别退回去：
 *   1. 登录与认领的拦截在页首，不让人填完整张表才发现提交不了
 *   2. 校验落到字段上：哪一栏没填就标哪一栏，而不是一句笼统的提示
 *   3. 两个标签页共用的通关字段只写一处
 */
import { computed, h, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { NButton, NCheckbox, NDatePicker, NInput, NRadioButton, NRadioGroup, NSelect, NTab, NTabs } from "naive-ui";
import { storeToRefs } from "pinia";
import { challengeDisplayName } from "@shared/labels";
import { challengeSelectionFromId, emptyChallengeSelection, challengeSelectionOptions, type ChallengeSelection } from "@shared/challenge-selection";
import { isRatedTier, ratedTierColor, ratedTierOrder, tierBadgeLabel } from "@shared/tiers";
import { beijingInputNow, toBeijingStorage } from "@shared/datetime";
import { api } from "@/lib/api";
import { catalog, catalogReady, refreshCatalog } from "@/lib/catalog";
import { expandBilibiliVideoRef } from "@/lib/bilibili";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import PanelBlock from "@/components/PanelBlock.vue";
import CampaignAutocomplete from "@/components/CampaignAutocomplete.vue";
import { validGameBananaUrl } from "@shared/gamebanana";
import FormField from "@/components/FormField.vue";
import ChallengePicker from "@/components/ChallengePicker.vue";
import TierBadge from "@/components/TierBadge.vue";
import HistRatingBadge from "@/components/HistRatingBadge.vue";

const route = useRoute();
const { t, apiError } = useLanguage();
const { account } = storeToRefs(useSessionStore());
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

const tab = ref<"run" | "challenge">("run");
const selection = ref<ChallengeSelection>(emptyChallengeSelection);
const addFc = ref(false);
const runTier = ref<string | null>(null);
const recommendation = ref<"none" | "yes" | "no">("none");

const campaignInput = ref("");
const mapInput = ref("");
const newChallengeName = ref("");
const newChallengeTier = ref<string | null>(null);
const newChallengeRules = ref("");
const newGameBananaUrl = ref("");

const videoUrl = ref("");
const rawVideoUrl = ref("");
const achievedAt = ref(beijingInputNow());
const duration = ref("");
const playerNote = ref("");

const done = ref(false);
const message = ref("");
const submitting = ref(false);
/* 首次点击提交之前不显示字段错误 —— 打开页面就满屏飘红是最劝退的表单反模式。 */
const attempted = ref(false);

/** 目录到位后才能把深链上的 challengeId 解析成一次完整选择。 */
let appliedChallengeId: number | null = null;
watch([catalogReady, () => route.query.challengeId], () => {
  if (!catalogReady.value) return;
  const wanted = Number(route.query.challengeId) || null;
  if (appliedChallengeId === wanted) return;
  appliedChallengeId = wanted;
  selection.value = challengeSelectionFromId(catalog.value, wanted);
  addFc.value = false;
  tab.value = "run";
}, { immediate: true });

const currentSelection = computed(() => challengeSelectionOptions(catalog.value, selection.value).value);
const selectedMap = computed(() => catalog.value.maps.find((item) => item.id === currentSelection.value.mapId));
const selectedChallenge = computed(() =>
  [...catalog.value.challenges, ...catalog.value.multiMapChallenges].find((item) => item.id === currentSelection.value.challengeId));

const term = computed(() => (compactTierLabels.value ? "T" : "Tier"));

/** Tier 候选带上色点，展开时不必逐行读文字就能定位难度档位。 */
const tierOptions = (head: Array<{ value: string; label: string }>) => [
  ...head.map((item) => ({ ...item, color: "" })),
  ...[...ratedTierOrder].reverse().map((tier) => ({
    value: tier,
    label: compactTierLabels.value ? tierBadgeLabel(tier).replace(/Tier\s*/g, "T") : tierBadgeLabel(tier),
    color: ratedTierColor(tier, tierColors.value),
  })),
];
const renderTierLabel = (option: { label: string; color: string }) => h("span", { style: "display:inline-flex;align-items:center;gap:8px" }, [
  option.color ? h("i", { style: `width:10px;height:10px;border-radius:2px;background:${option.color}` }) : null,
  option.label,
]);

const runTierOptions = computed(() => tierOptions([
  { value: "", label: t("submit.noValue") },
  { value: "undetermined", label: t("common.undetermined") },
]));
const newTierOptions = computed(() => tierOptions([{ value: "", label: t("submit.noValue") }]));

// 账号门槛：登录 + 已认领 B 站身份，两者缺一不可。
const gate = computed(() => {
  if (!account.value) return t(tab.value === "run" ? "submit.gateLogin" : "submit.gateLoginNew");
  if (!account.value.claimedPlayerId) return t(tab.value === "run" ? "submit.gateClaim" : "submit.gateClaimNew");
  return "";
});

const errors = computed<Record<string, string | undefined>>(() => (tab.value === "run"
  ? {
    challenge: !selectedChallenge.value ? t("submit.needChallenge") : undefined,
    video: !videoUrl.value.trim() ? t("common.required") : undefined,
  }
  : {
    gameBanana: !newGameBananaUrl.value.trim() ? t("common.required") : !validGameBananaUrl(newGameBananaUrl.value) ? t("error.gameBananaInvalid") : undefined,
    campaign: !campaignInput.value.trim() ? t("common.required") : undefined,
    map: !mapInput.value.trim() ? t("common.required") : undefined,
    name: !newChallengeName.value.trim() ? t("common.required") : undefined,
    video: !videoUrl.value.trim() ? t("common.required") : undefined,
  }));
const invalid = computed(() => Object.values(errors.value).some(Boolean));
const show = (key: string) => (attempted.value ? errors.value[key] : undefined);

const achievedStamp = computed({
  get: () => (achievedAt.value ? new Date(`${achievedAt.value}:00+08:00`).getTime() : null),
  set: (value: number | null) => {
    if (!value) { achievedAt.value = ""; return; }
    const beijing = new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
    achievedAt.value = beijing.slice(0, 16).replace(" ", "T");
  },
});

function resetShared() {
  videoUrl.value = "";
  rawVideoUrl.value = "";
  playerNote.value = "";
  duration.value = "";
  achievedAt.value = beijingInputNow();
  attempted.value = false;
}

async function postSubmission(payload: object) {
  submitting.value = true;
  const { ok, data } = await api.post<{ record?: { status: string } }>("/api/submissions", payload);
  submitting.value = false;
  if (!ok) { message.value = apiError(data, "submit.failed"); return null; }
  // Std 挑战直接落库，目录要跟着刷新。
  if (data.record?.status === "accepted") void refreshCatalog();
  return data.record ?? { status: "pending" };
}

async function submitRun() {
  done.value = false;
  message.value = "";
  attempted.value = true;
  if (gate.value) { message.value = gate.value; return; }
  if (invalid.value) { message.value = t("submit.incomplete"); return; }
  const challenge = selectedChallenge.value!;
  const saved = await postSubmission({
    kind: "run",
    challengeId: challenge.id,
    achievedAt: toBeijingStorage(achievedAt.value),
    videoUrl: videoUrl.value.trim(),
    addFc: challenge.type === "C/FC" && addFc.value,
    rawVideoUrl: rawVideoUrl.value.trim() || undefined,
    playerNote: playerNote.value.trim() || undefined,
    recommends: recommendation.value === "none" ? null : recommendation.value === "yes",
    opinionTier: isRatedTier(runTier.value) ? runTier.value : undefined,
    duration: duration.value.trim() || undefined,
  });
  if (!saved) return;
  selection.value = emptyChallengeSelection;
  runTier.value = null;
  recommendation.value = "none";
  addFc.value = false;
  resetShared();
  done.value = true;
  message.value = t(saved.status === "accepted" ? "submit.standardDone" : "submit.runDone");
}

async function submitChallenge() {
  done.value = false;
  message.value = "";
  attempted.value = true;
  if (gate.value) { message.value = gate.value; return; }
  if (invalid.value) { message.value = t("submit.incomplete"); return; }
  const saved = await postSubmission({
    kind: "challenge",
    achievedAt: toBeijingStorage(achievedAt.value),
    videoUrl: videoUrl.value.trim(),
    rawVideoUrl: rawVideoUrl.value.trim() || undefined,
    playerNote: playerNote.value.trim() || undefined,
    duration: duration.value.trim() || undefined,
    opinionTier: isRatedTier(newChallengeTier.value) ? newChallengeTier.value : undefined,
    proposedTarget: {
      campaignName: campaignInput.value.trim(),
      mapName: mapInput.value.trim(),
      challengeName: newChallengeName.value.trim(),
      gameBananaUrl: newGameBananaUrl.value.trim() || undefined,
      suggestedTier: newChallengeTier.value || undefined,
      rules: newChallengeRules.value.trim() || undefined,
    },
  });
  if (!saved) return;
  campaignInput.value = "";
  mapInput.value = "";
  newChallengeTier.value = null;
  newChallengeName.value = "";
  newChallengeRules.value = "";
  newGameBananaUrl.value = "";
  resetShared();
  done.value = true;
  message.value = t("submit.challengeDone");
}

watch(tab, () => {
  addFc.value = false;
  done.value = false;
  attempted.value = false;
  message.value = "";
});

const pickedRail = computed(() => (isRatedTier(selectedChallenge.value?.tier)
  ? ratedTierColor(selectedChallenge.value!.tier!, tierColors.value)
  : undefined));

onMounted(() => { achievedAt.value = beijingInputNow(); });
</script>

<template>
  <div class="page">
    <header class="head">
      <p class="eyebrow">{{ t("submit.eyebrow") }}</p>
      <h1 class="title">{{ t(tab === "run" ? "submit.runTitle" : "submit.challengeTitle") }}</h1>
      <p class="lede">{{ t(tab === "run" ? "submit.runLede" : "submit.challengeLede") }}</p>
      <p class="policy">{{ t("submit.standardIntegrity") }}</p>
    </header>

    <!-- 页面级切换沿用全站 Line 标签样式。 -->
    <NTabs show-scroll-button v-model:value="tab" type="line" size="large" justify-content="space-around" :aria-label="t('submit.type')">
      <NTab name="run">{{ t("common.submitChallenge") }}</NTab>
      <NTab name="challenge">{{ t("submit.challengeTitle") }}</NTab>
    </NTabs>

    <!-- 危险色只做一道色脊，不填充：它的色相与 Tier l0 重合，大面积填充会与
         难度徽章混淆。 -->
    <p v-if="gate" class="gate" role="status">
      <span class="gate-mark" aria-hidden="true" />
      {{ gate }}
    </p>

    <template v-if="tab === 'run'">
      <PanelBlock :title="t('submit.pick')" :subtitle="t('submit.pickHint')">
        <ChallengePicker v-model="selection" :error="show('challenge')" />

        <div v-if="selectedChallenge" class="picked" :style="pickedRail ? { '--picked-rail': pickedRail } : undefined">
          <div class="picked-top">
            <strong>{{ challengeDisplayName(selectedChallenge) }}</strong>
            <HistRatingBadge v-if="selectedMap" :map-id="selectedMap.id" size="lg" />
            <TierBadge v-if="selectedChallenge.tier" :tier="selectedChallenge.tier" size="lg" />
          </div>
          <p class="picked-note">{{ t("submit.rawNotNeeded") }}</p>
          <!-- 全收集是一个决定，不是说明，所以给它自己的一格。 -->
          <div v-if="selectedChallenge.type === 'C/FC'" class="fc-option">
            <NCheckbox v-model:checked="addFc" :disabled="submitting">{{ t("submit.addFc") }}</NCheckbox>
          </div>
        </div>
      </PanelBlock>

      <PanelBlock :title="t('submit.runInfo')" :subtitle="t('submit.runInfoHint')">
        <div class="form">
          <FormField :label="t('submit.videoRun')" :hint="t('submit.bvHint')" :error="show('video')" required wide>
            <NInput
              v-model:value="videoUrl"
              :placeholder="t('submit.videoPlaceholder')"
              :status="show('video') ? 'error' : undefined"
              @blur="videoUrl = expandBilibiliVideoRef(videoUrl)"
            />
          </FormField>
          <FormField :label="t('submit.rawVideo')" :hint="t('submit.rawHint')" wide>
            <NInput v-model:value="rawVideoUrl" :placeholder="t('submit.videoPlaceholder')" @blur="rawVideoUrl = expandBilibiliVideoRef(rawVideoUrl)" />
          </FormField>
          <FormField :label="t('record.achievedAt')">
            <NDatePicker v-model:value="achievedStamp" type="datetime" class="full" />
          </FormField>
          <FormField :label="t('record.duration')" :hint="t('submit.optional')">
            <NInput v-model:value="duration" :placeholder="t('submit.durationPlaceholder')" />
          </FormField>
          <FormField :label="t('record.playerNote')" :hint="t('submit.playerNoteHint')" wide>
            <NInput v-model:value="playerNote" type="textarea" :rows="4" />
          </FormField>
        </div>

        <div class="opinion">
          <FormField :label="t('stats.tierOpinion')" :hint="t('submit.tierHint')">
            <NSelect
              v-model:value="runTier"
              :options="runTierOptions"
              :render-label="renderTierLabel"
              :placeholder="t('submit.noValue')"
              :aria-label="t('stats.tierOpinion')"
            />
          </FormField>
          <!-- 三态单选（未表态 / 推荐 / 不推荐）：选中态不依赖 hover，
               触摸屏上 hover 会粘住。 -->
          <div class="recommend">
            <span class="recommend-label">{{ t("record.recommendField") }}</span>
            <NRadioGroup v-model:value="recommendation" size="small" :aria-label="t('record.recommendField')">
              <NRadioButton value="none">{{ t("record.noStance") }}</NRadioButton>
              <NRadioButton value="yes">{{ t("recommendation.yes") }}</NRadioButton>
              <NRadioButton value="no">{{ t("recommendation.no") }}</NRadioButton>
            </NRadioGroup>
          </div>
        </div>
      </PanelBlock>
    </template>

    <template v-else>
      <PanelBlock :title="t('submit.newMap')" :subtitle="t('submit.newMapHint')">
        <div class="form">
          <FormField :label="t('submit.campaignName')" :error="show('campaign')" required>
            <CampaignAutocomplete v-model:value="campaignInput" v-model:game-banana-url="newGameBananaUrl" :status="show('campaign') ? 'error' : undefined" />
          </FormField>
          <FormField :label="t('submit.mapName')" :error="show('map')" required>
            <NInput v-model:value="mapInput" :status="show('map') ? 'error' : undefined" />
          </FormField>
          <FormField :label="t('submit.gameBanana')" :hint="t('submit.gameBananaHint')" :error="show('gameBanana')" required wide>
            <NInput v-model:value="newGameBananaUrl" :status="show('gameBanana') ? 'error' : undefined" placeholder="https://gamebanana.com/mods/..." />
          </FormField>
        </div>
      </PanelBlock>

      <PanelBlock :title="t('challenge.kicker')" :subtitle="t('submit.challengeSectionHint')">
        <div class="form">
          <FormField :label="t('submit.challengeName')" :error="show('name')" required>
            <NInput v-model:value="newChallengeName" :status="show('name') ? 'error' : undefined" />
          </FormField>
          <FormField :label="t('submit.suggestTier', { term })">
            <NSelect
              v-model:value="newChallengeTier"
              :options="newTierOptions"
              :render-label="renderTierLabel"
              :placeholder="t('submit.chooseTier', { term })"
              :aria-label="t('submit.suggestTier', { term })"
            />
          </FormField>
          <FormField :label="t('submit.rules')" :hint="t('submit.rulesHint')" wide>
            <NInput v-model:value="newChallengeRules" type="textarea" :rows="5" />
          </FormField>
        </div>
      </PanelBlock>

      <PanelBlock :title="t('player.recordCount')" :subtitle="t('submit.recordHint')">
        <div class="form">
          <FormField :label="t('submit.videoNew')" :hint="t('submit.bvHint')" :error="show('video')" required wide>
            <NInput
              v-model:value="videoUrl"
              :placeholder="t('submit.videoPlaceholder')"
              :status="show('video') ? 'error' : undefined"
              @blur="videoUrl = expandBilibiliVideoRef(videoUrl)"
            />
          </FormField>
          <FormField :label="t('submit.rawVideo')" :hint="t('submit.rawHint')" wide>
            <NInput v-model:value="rawVideoUrl" :placeholder="t('submit.videoPlaceholder')" @blur="rawVideoUrl = expandBilibiliVideoRef(rawVideoUrl)" />
          </FormField>
          <FormField :label="t('record.achievedAt')">
            <NDatePicker v-model:value="achievedStamp" type="datetime" class="full" />
          </FormField>
          <FormField :label="t('record.duration')" :hint="t('submit.optional')">
            <NInput v-model:value="duration" :placeholder="t('submit.durationPlaceholder')" />
          </FormField>
          <FormField :label="t('record.playerNote')" :hint="t('submit.playerNoteHint')" wide>
            <NInput v-model:value="playerNote" type="textarea" :rows="4" />
          </FormField>
        </div>
      </PanelBlock>
    </template>

    <div class="actions">
      <NButton size="large" type="primary" :loading="submitting" @click="tab === 'run' ? submitRun() : submitChallenge()">
        {{ submitting ? t("submit.submitting") : t(tab === "run" ? "common.submitChallenge" : "submit.challengeTitle") }}
      </NButton>
      <p v-if="message" :class="done ? 'success' : 'error'" role="status">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  /* 表单窄一些好读：标签与输入框离得近，眼睛不用来回横扫。 */
  max-width: 680px;
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-7) 96px;
  display: grid;
  gap: var(--sp-6);
}

.head { display: grid; gap: var(--sp-3); }
.eyebrow {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}
.title {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.02em;
  color: var(--fg-default);
  text-wrap: balance;
}
.lede { margin: 0; max-width: 60ch; font-size: var(--fs-lead); line-height: var(--lh-body); color: var(--fg-secondary); }
.policy { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }

/* ── 账号门槛：拦截在表单之前，不是提交按钮之后。 ── */
.gate {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--danger-500);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--fs-body);
  line-height: var(--lh-snug);
  color: var(--fg-secondary);
}
.gate-mark { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--danger-400); }

/* ── 表单网格：自适应两列，wide 字段占满整行。 ── */
.form, .opinion { display: grid; gap: var(--sp-5); }
.form { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.opinion { grid-template-columns: minmax(200px, 1fr) auto; align-items: start; margin-top: var(--sp-5); }
.full { width: 100%; }

/* ── 已选挑战确认块：色脊取自该挑战的 Tier 颜色，与徽章、页首同一条语言。 ── */
.picked {
  margin-top: var(--sp-5);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-left: var(--rail-w) solid var(--picked-rail, var(--border-strong));
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.picked-top { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.picked-top strong { font-size: var(--fs-lead); font-weight: var(--fw-medium); color: var(--fg-default); }
.picked-note { margin: var(--sp-2) 0 0; font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--fg-subtle); }

/* 一条通到 .picked 两侧内边距的细线把这一格与上面的说明分开。 */
.fc-option {
  margin: var(--sp-3) calc(var(--sp-4) * -1) 0;
  padding: var(--sp-3) var(--sp-4) 0;
  border-top: var(--hairline);
}

.recommend { display: grid; gap: var(--sp-2); align-content: start; min-width: 0; }
.recommend-label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }

.actions { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; padding-top: var(--sp-5); border-top: var(--hairline); }
.success, .error { margin: 0; font-size: var(--fs-body); line-height: var(--lh-snug); }
.success { color: var(--accent-300); }
.error { color: var(--danger-400); }

@media (max-width: 640px) {
  .page { padding: var(--sp-5) var(--sp-4) 72px; gap: var(--sp-5); }
  .form, .opinion { grid-template-columns: 1fr; }
  .actions > :first-child { width: 100%; }
}
</style>
