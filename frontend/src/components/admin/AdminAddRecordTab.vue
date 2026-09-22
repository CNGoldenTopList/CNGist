<script setup lang="ts">
/** 后台补录；拒绝接受的玩家不可补录，其他状态保持审核规则。 */
import { computed, ref } from "vue";
import { NAlert, NButton, NDatePicker, NInput, NSelect } from "naive-ui";
import { beijingInputNow, toBeijingStorage } from "@shared/datetime";
import { playerBilibiliUids } from "@shared/bilibili-uid";
import { emptyChallengeSelection, type ChallengeSelection } from "@shared/challenge-selection";
import type { AdminRecord, AdminReviewState, PlayerDirectory } from "@shared/admin";
import { api } from "@/lib/api";
import { catalog } from "@/lib/catalog";
import { applyEffects } from "@/lib/admin-resources";
import { toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import ChallengePicker from "@/components/ChallengePicker.vue";

const props = defineProps<{ directory: PlayerDirectory }>();

const selection = ref<ChallengeSelection>(emptyChallengeSelection);
const playerId = ref<number | null>(null);
const status = ref<"pending" | "accepted">("pending");
const videoUrl = ref("");
const rawVideoUrl = ref("");
const achievedAt = ref<number | null>(new Date(`${beijingInputNow()}:00+08:00`).getTime());
const playerNote = ref("");
const saving = ref(false);

const playerOptions = computed(() => catalog.value.players.map((player) => {
  const uids = playerBilibiliUids(player);
  return { value: player.id, label: uids.length ? `${player.name} — UID ${uids[0]}` : player.name };
}));

const playerStatus = computed(() => props.directory.statuses[String(playerId.value)]
  || catalog.value.players.find(item => item.id === playerId.value)?.status || "unasked");

const statusOptions = [
  { value: "pending", label: "加入待审核队列" },
  { value: "accepted", label: "直接添加已通过记录" },
];

const storageOf = (value: number | null) => (value
  ? new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 16)
  : "");

async function save() {
  if (!playerId.value || !selection.value.challengeId || !videoUrl.value.trim()) {
    toast.error("请选择玩家和挑战，并填写挑战视频链接。");
    return;
  }
  if (playerStatus.value === "blocked") {
    toast.error("该玩家状态为“榜拒绝接受”，无法补录挑战。");
    return;
  }
  const finalStatus: AdminReviewState = playerStatus.value === "unwilling" ? "rejected"
    : status.value === "accepted" && playerStatus.value === "unreplied" ? "hidden"
      : status.value;

  saving.value = true;
  const { ok, data } = await api.post<{ record?: AdminRecord }>("/api/admin/submissions", {
    playerId: playerId.value,
    challengeId: selection.value.challengeId,
    videoUrl: videoUrl.value.trim(),
    rawVideoUrl: rawVideoUrl.value.trim(),
    achievedAt: toBeijingStorage(storageOf(achievedAt.value)),
    playerNote: playerNote.value,
    status: finalStatus,
  });
  saving.value = false;
  if (!ok || !data.record) { toast.error(data.error || "记录保存失败。"); return; }

  selection.value = emptyChallengeSelection;
  playerId.value = null;
  videoUrl.value = "";
  rawVideoUrl.value = "";
  playerNote.value = "";
  achievedAt.value = new Date(`${beijingInputNow()}:00+08:00`).getTime();
  status.value = "pending";
  toast.success("记录已保存。");
  await applyEffects("/api/admin/submissions");
}
</script>

<template>
  <PanelBlock title="添加挑战记录">
    <div class="adm-form">
      <FormField label="玩家" hint="输入名字或 B 站 UID 搜索">
        <NSelect v-model:value="playerId" :options="playerOptions" filterable clearable placeholder="开始输入玩家" aria-label="玩家" />
      </FormField>
      <NAlert v-if="playerStatus === 'unwilling'" type="warning" class="adm-form-wide">
        该玩家不愿意上榜，请尊重玩家意愿。按当前审核规则，补录记录将保存为已拒绝。
      </NAlert>
      <NAlert v-else-if="playerStatus === 'blocked'" type="error" class="adm-form-wide">
        该玩家状态为“榜拒绝接受”，无法补录挑战。
      </NAlert>
      <FormField label="处理方式">
        <NSelect v-model:value="status" :options="statusOptions" aria-label="处理方式" />
      </FormField>

      <div class="adm-form-wide">
        <ChallengePicker v-model="selection" />
      </div>

      <FormField label="达成时间" hint="北京时间">
        <NDatePicker v-model:value="achievedAt" type="datetime" class="full" />
      </FormField>
      <FormField label="挑战视频链接" required wide>
        <NInput v-model:value="videoUrl" placeholder="https://" />
      </FormField>
      <FormField label="RAW 视频链接" wide>
        <NInput v-model:value="rawVideoUrl" placeholder="https://" />
      </FormField>
      <FormField label="玩家备注" wide>
        <NInput v-model:value="playerNote" type="textarea" :rows="3" />
      </FormField>

      <div class="adm-actions adm-form-wide">
        <NButton type="primary" :loading="saving" :disabled="playerStatus === 'blocked'" @click="save">保存记录</NButton>
      </div>
    </div>
  </PanelBlock>
</template>

<style scoped>
.full { width: 100%; }
</style>
