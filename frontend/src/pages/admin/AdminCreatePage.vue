<script setup lang="ts">
/**
 * 新建地图包 / 地图 / 挑战项目。
 *
 * 整棵子树一次提交：服务端在同一个事务里建完地图包、地图与挑战 —— 分三次发
 * 会在中途留下「地图包有了但一张图都没有」的半成品。
 *
 * 归属类型的两个选择各自留着：来回切一下不该清掉从 `?campaign=` 或 `?map=`
 * 带进来的预选，保存时只发当前类型用得上的那一个。
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { NButton, NInput, NRadioButton, NRadioGroup, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { catalog } from "@/lib/catalog";
import { sendAdminCommand } from "@/lib/admin-resources";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";
import TierSelect from "@/components/TierSelect.vue";
import LinkButton from "@/components/LinkButton.vue";
import AdminImageUpload from "@/components/admin/AdminImageUpload.vue";

import type { ChallengeType } from "@shared/types";
import ChallengeTypeSelect from "@/components/admin/ChallengeTypeSelect.vue";

const props = defineProps<{ kind: string }>();

type ChallengeInput = { type: ChallengeType; name: string; tier: string | null; notice: string };
type MapInput = { name: string; cnName: string; aliases: string; banner: string; bannerPreview: string; notice: string; challenges: ChallengeInput[] };

const emptyChallenge = (): ChallengeInput => ({ name: "", type: "Other", tier: "t7", notice: "" });
const emptyMap = (): MapInput => ({ name: "", cnName: "", aliases: "", banner: "", bannerPreview: "", notice: "", challenges: [emptyChallenge()] });

const route = useRoute();
const { account } = storeToRefs(useSessionStore());

const kind = computed(() => (props.kind === "campaign" || props.kind === "map" || props.kind === "challenge" ? props.kind : "campaign"));

const notice = ref("");
const name = ref("");
const cnName = ref("");
const aliases = ref("");
const banner = ref("");
const bannerPreview = ref("");
const publicationUrl = ref("");
const entityNotice = ref("");
const campaignId = ref<number | null>(route.query.campaign ? Number(route.query.campaign) : null);
const mapId = ref<number | null>(route.query.map ? Number(route.query.map) : null);
const challengeScope = ref<"map" | "campaign">(route.query.campaign ? "campaign" : "map");
const challengeType = ref<ChallengeType>("Other");
const challengeTier = ref<string | null>("t7");
const mapRows = ref<MapInput[]>([emptyMap()]);
const challengeRows = ref<ChallengeInput[]>([emptyChallenge()]);
const order = ref<Array<number | "new">>([]);
const drag = ref<number | "new" | null>(null);
const saving = ref(false);

const isMultiMap = computed(() => kind.value === "challenge" && challengeScope.value === "campaign");

const campaignOptions = computed(() => catalog.value.campaigns.map((item) => ({ value: item.id, label: item.name })));
const mapOptions = computed(() => catalog.value.maps.map((item) => ({ value: item.id, label: item.name })));

/** 新建的内容排在最后，管理员再拖到它应该在的位置。 */
watch([kind, campaignId, mapId, challengeScope, () => catalog.value], () => {
  if (kind.value === "map" && campaignId.value) {
    order.value = [...catalog.value.maps.filter((map) => map.campaignId === campaignId.value).map((map) => map.id), "new"];
  } else if (kind.value === "challenge" && challengeScope.value === "map" && mapId.value) {
    order.value = [...catalog.value.challenges.filter((item) => item.mapId === mapId.value).map((item) => item.id), "new"];
  } else if (isMultiMap.value && campaignId.value) {
    order.value = [...catalog.value.multiMapChallenges.filter((item) => item.campaignId === campaignId.value).map((item) => item.id), "new"];
  } else {
    order.value = [];
  }
}, { immediate: true });

function reorder(token: number | "new", before: number | "new") {
  const next = order.value.filter((item) => item !== token);
  const index = next.indexOf(before);
  next.splice(index < 0 ? next.length : index, 0, token);
  order.value = next;
}

const splitAliases = (value: string) => value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);

const title = computed(() => (kind.value === "campaign" ? "新建地图包"
  : kind.value === "map" ? "新建地图"
    : isMultiMap.value ? "新建多地图挑战" : "新建挑战项目"));

async function save() {
  if (!account.value || !name.value.trim()) { notice.value = "请至少填写名称，并确认已登录管理员账户。"; return; }
  if (kind.value === "map" && !campaignId.value) { notice.value = "请选择从属地图包。"; return; }
  if (kind.value === "challenge" && !isMultiMap.value && !mapId.value) { notice.value = "请选择从属地图。"; return; }
  if (isMultiMap.value && !campaignId.value) { notice.value = "请选择从属地图包。"; return; }

  const body = {
    kind: kind.value,
    name: name.value.trim(),
    cnName: cnName.value.trim(),
    aliases: splitAliases(aliases.value),
    ...(banner.value ? { banner: banner.value } : {}),
    publicationUrl: publicationUrl.value.trim(),
    notice: entityNotice.value.trim(),
    campaignId: campaignId.value,
    mapId: isMultiMap.value ? null : mapId.value,
    type: challengeType.value,
    tier: challengeTier.value,
    order: order.value,
    scope: kind.value === "challenge" ? challengeScope.value : undefined,
    maps: kind.value === "campaign"
      ? mapRows.value.filter((row) => row.name.trim()).map((row) => ({
        name: row.name.trim(),
        cnName: row.cnName.trim(),
        aliases: splitAliases(row.aliases),
        ...(row.banner ? { banner: row.banner } : {}),
        notice: row.notice.trim(),
        challenges: row.challenges.filter((item) => item.name.trim())
          .map((item) => ({ name: item.name.trim(), type: item.type, tier: item.tier, notice: item.notice.trim() })),
      }))
      : [],
    challenges: kind.value === "map"
      ? challengeRows.value.filter((row) => row.name.trim())
        .map((row) => ({ name: row.name.trim(), type: row.type, tier: row.tier, notice: row.notice.trim() }))
      : [],
  };

  saving.value = true;
  try {
    await sendAdminCommand("/api/admin/catalog", { body });
  } catch (cause) {
    notice.value = cause instanceof Error ? cause.message : "创建失败，请稍后重试。";
    saving.value = false;
    return;
  }
  saving.value = false;
  notice.value = "已创建并写入数据库，表单已清空。";
  name.value = "";
  cnName.value = "";
  aliases.value = "";
  banner.value = "";
  bannerPreview.value = "";
  publicationUrl.value = "";
  entityNotice.value = "";
  challengeType.value = "Other";
  challengeTier.value = "t7";
  mapRows.value = [emptyMap()];
  challengeRows.value = [emptyChallenge()];
}

const nameLabel = computed(() => `${kind.value === "campaign" ? "地图包" : kind.value === "map" ? "地图" : "挑战"}名称`);
const orderTitle = computed(() => (kind.value === "map" ? "在地图包里的顺序"
  : isMultiMap.value ? "在地图包里的多地图挑战顺序" : "在地图里的挑战顺序"));
const showOrder = computed(() => (kind.value === "map" && campaignId.value)
  || (kind.value === "challenge" && !isMultiMap.value && mapId.value)
  || (isMultiMap.value && campaignId.value));

function tokenLabel(token: number | "new") {
  if (token === "new") return `新建内容：${name.value || "未命名"}`;
  if (kind.value === "map") return catalog.value.maps.find((map) => map.id === token)?.name || String(token);
  if (isMultiMap.value) return catalog.value.multiMapChallenges.find((item) => item.id === token)?.name || String(token);
  return catalog.value.challenges.find((item) => item.id === token)?.name || String(token);
}
</script>

<template>
  <PageShell eyebrow="挑战管理" :title="title" width="wide">
    <template #actions>
      <LinkButton to="/admin?tab=challenges" quaternary>返回挑战管理</LinkButton>
    </template>

    <p v-if="notice" class="adm-notice" role="status">{{ notice }}</p>

    <PanelBlock title="基本资料">
      <div class="adm-form">
        <FormField v-if="kind === 'map'" label="从属地图包" required>
          <NSelect v-model:value="campaignId" :options="campaignOptions" filterable clearable placeholder="请选择" aria-label="从属地图包" />
        </FormField>

        <template v-if="kind === 'challenge'">
          <FormField label="挑战归属类型" hint="多地图挑战直接挂在地图包上，不属于某一张具体地图">
            <NRadioGroup v-model:value="challengeScope" size="small" aria-label="挑战归属类型">
              <NRadioButton value="map">地图挑战</NRadioButton>
              <NRadioButton value="campaign">多地图挑战</NRadioButton>
            </NRadioGroup>
          </FormField>
          <FormField v-if="isMultiMap" label="从属地图包" required>
            <NSelect v-model:value="campaignId" :options="campaignOptions" filterable clearable placeholder="请选择" aria-label="从属地图包" />
          </FormField>
          <FormField v-else label="从属地图" required>
            <NSelect v-model:value="mapId" :options="mapOptions" filterable clearable placeholder="请选择" aria-label="从属地图" />
          </FormField>
        </template>

        <FormField :label="nameLabel" required>
          <NInput v-model:value="name" />
        </FormField>

        <template v-if="kind !== 'challenge'">
          <FormField label="中文翻译"><NInput v-model:value="cnName" /></FormField>
          <FormField label="中文别名" hint="逗号分隔"><NInput v-model:value="aliases" /></FormField>
          <AdminImageUpload v-model="banner" v-model:preview="bannerPreview" />
          <FormField v-if="kind === 'campaign'" label="发布地址">
            <NInput v-model:value="publicationUrl" placeholder="https://gamebanana.com/mods/..." />
          </FormField>
        </template>
        <template v-else>
          <FormField label="挑战类型"><ChallengeTypeSelect v-model="challengeType" /></FormField>
          <FormField label="难度"><TierSelect v-model="challengeTier" /></FormField>
        </template>

        <FormField label="注意事项" hint="例如：该挑战需要收集 1-8A 所有草莓" wide>
          <NInput v-model:value="entityNotice" type="textarea" :rows="3" />
        </FormField>
      </div>
    </PanelBlock>

    <PanelBlock
      v-if="kind === 'campaign'"
      title="地图包内的地图与挑战"
      subtitle="可以一次把整包的结构建好，也可以先留空、之后再补。"
    >
      <template #actions>
        <NButton size="small" @click="mapRows = [...mapRows, emptyMap()]">添加地图</NButton>
      </template>
      <div class="builder">
        <article v-for="(row, mapIndex) in mapRows" :key="mapIndex" class="nested">
          <div class="adm-form">
            <FormField label="地图名"><NInput v-model:value="row.name" /></FormField>
            <FormField label="中文翻译"><NInput v-model:value="row.cnName" /></FormField>
            <FormField label="中文别名" hint="逗号分隔"><NInput v-model:value="row.aliases" /></FormField>
            <FormField label="地图注意事项"><NInput v-model:value="row.notice" /></FormField>
            <div class="adm-form-wide">
              <AdminImageUpload v-model="row.banner" v-model:preview="row.bannerPreview" />
            </div>
          </div>

          <h4 class="nested-title">挑战</h4>
          <div v-for="(challenge, index) in row.challenges" :key="index" class="challenge-row">
            <NInput v-model:value="challenge.name" placeholder="挑战名" />
            <ChallengeTypeSelect v-model="challenge.type" />
            <TierSelect v-model="challenge.tier" />
            <NInput v-model:value="challenge.notice" placeholder="注意事项" />
          </div>
          <NButton size="small" quaternary @click="row.challenges = [...row.challenges, emptyChallenge()]">添加挑战</NButton>
        </article>
      </div>
    </PanelBlock>

    <PanelBlock v-if="kind === 'map'" title="地图内的挑战">
      <template #actions>
        <NButton size="small" @click="challengeRows = [...challengeRows, emptyChallenge()]">添加挑战</NButton>
      </template>
      <div class="builder">
        <div v-for="(row, index) in challengeRows" :key="index" class="challenge-row">
          <NInput v-model:value="row.name" placeholder="挑战名" />
          <ChallengeTypeSelect v-model="row.type" />
          <TierSelect v-model="row.tier" />
          <NInput v-model:value="row.notice" placeholder="注意事项" />
        </div>
      </div>
    </PanelBlock>

    <PanelBlock v-if="showOrder" :title="orderTitle" subtitle="把「新建内容」拖到它应该在的位置。">
      <ul class="order">
        <li
          v-for="token in order"
          :key="token"
          class="order-item"
          :data-new="token === 'new' || undefined"
          draggable="true"
          @dragstart="drag = token"
          @dragover.prevent
          @drop="drag !== null && reorder(drag, token); drag = null"
        >{{ tokenLabel(token) }}</li>
      </ul>
    </PanelBlock>

    <div class="adm-actions end">
      <NButton size="large" type="primary" :loading="saving" @click="save">创建并记录</NButton>
    </div>
  </PageShell>
</template>

<style scoped>
.end { justify-content: flex-end; }
.builder { display: grid; gap: var(--sp-4); }
.nested { display: grid; gap: var(--sp-3); padding: var(--sp-4); background: var(--bg-inset); border-radius: var(--r-md); }
.nested-title { margin: 0; font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--fg-muted); }
/* 挑战依次填写名称、类型、难度和注意事项。 */
.challenge-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px 160px minmax(0, 1fr); gap: var(--sp-2); }

.order { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-2); }
.order-item {
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  cursor: grab;
}
/* 新建的那一项要一眼找得到，否则拖动时不知道在拖谁。 */
.order-item[data-new] { border: 1px dashed var(--accent-400); color: var(--fg-default); }

@media (max-width: 900px) {
  .challenge-row { grid-template-columns: 1fr; }
}
</style>
