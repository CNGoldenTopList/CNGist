<script setup lang="ts">
/**
 * 带金房间提醒。玩家带金进入指定房间时推送到 QQ 群，同一次停留只提醒一次。
 *
 * 房间候选来自玩家 Mod 上传的路线，因此只有「SID／面配对已审核」的地图才选得出
 * 房间 —— 选不出时要把原因写出来，不能只留一个空下拉。
 */
import { computed, onMounted, ref, watch } from "vue";
import { NButton, NCheckbox, NInput, NSelect } from "naive-ui";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-resources";
import FormField from "@/components/FormField.vue";
import PanelBlock from "@/components/PanelBlock.vue";

type MapRoom = { sid: string; side: string; roomKey: string; roomName: string; position: number };
type Rule = MapRoom & { id: number; mapId: number; mapName: string; campaignName: string; extraText: string; enabled: boolean };
type Data = {
  maps: Array<{ id: number; name: string; cnName: string | null; campaignName: string; campaignCnName: string | null }>;
  rules: Rule[];
  rooms: MapRoom[];
};

const roomId = (room: MapRoom) => JSON.stringify([room.sid, room.side, room.roomKey]);
const sideName = (side: string) => ({ Normal: "A 面", BSide: "B 面", CSide: "C 面" }[side] ?? side);

const data = ref<Data>({ maps: [], rules: [], rooms: [] });
const mapId = ref<number | null>(null);
const selected = ref<string | null>(null);
const editing = ref<Rule | null>(null);
const extraText = ref("");
const enabled = ref(true);
const busy = ref(false);
const loading = ref(true);
const error = ref("");
const notice = ref("");

async function reload() {
  loading.value = true;
  const { ok, data: body } = await api.get<{ data?: Data }>(`/api/admin/golden-room-rules?mapId=${mapId.value ?? ""}`);
  loading.value = false;
  if (!ok || !body.data) { error.value = body.error || "加载失败。"; return; }
  data.value = body.data;
  error.value = "";
}

onMounted(reload);
watch(mapId, () => { data.value = { ...data.value, rooms: [] }; reset(); void reload(); });

function reset() {
  editing.value = null;
  selected.value = null;
  extraText.value = "";
  enabled.value = true;
}

async function mutate(body: object) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await sendAdminCommand("/api/admin/golden-room-rules", { body });
    reset();
    await reload();
    notice.value = "已保存。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败。";
  } finally {
    busy.value = false;
  }
}

const room = computed(() => data.value.rooms.find((item) => roomId(item) === selected.value)
  ?? (editing.value && roomId(editing.value) === selected.value ? editing.value : null));

const mapOptions = computed(() => data.value.maps.map((item) => ({
  value: item.id,
  label: `${item.campaignCnName || item.campaignName} / ${item.cnName || item.name}`,
})));
const roomOptions = computed(() => data.value.rooms.map((item) => ({
  value: roomId(item),
  label: `${item.position}. ${item.roomName} — ${sideName(item.side)} · ${item.roomKey}`,
})));

function save() {
  const target = room.value;
  if (!target || !mapId.value) return;
  void mutate({
    id: editing.value?.id,
    mapId: mapId.value,
    sid: target.sid,
    side: target.side,
    roomKey: target.roomKey,
    extraText: extraText.value,
    enabled: enabled.value,
  });
}

function edit(rule: Rule) {
  mapId.value = rule.mapId;
  editing.value = rule;
  selected.value = roomId(rule);
  extraText.value = rule.extraText;
  enabled.value = rule.enabled;
  notice.value = "";
}
</script>

<template>
  <div class="adm-section">
    <PanelBlock title="带金房间提醒">
      <p class="lede">玩家带金进入指定房间时，推送到第一个启用的 QQ 群，并附上可获取的直播间链接。同一次停留只提醒一次。</p>
      <p v-if="error" class="adm-warn" role="alert">{{ error }}</p>
      <p v-if="notice" class="adm-notice" role="status">{{ notice }}</p>

      <div class="adm-form">
        <FormField label="地图包 / 地图" wide>
          <NSelect v-model:value="mapId" :options="mapOptions" filterable clearable :disabled="busy" aria-label="选择提醒地图" />
        </FormField>
        <FormField label="Mod 路线房间" wide>
          <NSelect v-model:value="selected" :options="roomOptions" filterable clearable :disabled="busy || loading || !mapId" aria-label="选择提醒房间" />
        </FormField>
      </div>

      <p v-if="mapId && !loading && !data.rooms.length" class="adm-empty">
        还没有可用路线。需要玩家 Mod 上传这张地图的路线，且 SID／面配对已审核。
      </p>
      <p v-if="editing" class="adm-card-meta">编辑：{{ editing.campaignName }} / {{ editing.mapName }} · {{ editing.roomName }}（{{ editing.roomKey }}）</p>

      <FormField label="追加推送文本（可留空）">
        <NInput v-model:value="extraText" type="textarea" :rows="3" :maxlength="800" :disabled="busy" placeholder="例如：快到终点了，来直播间一起见证！" />
      </FormField>
      <NCheckbox v-model:checked="enabled" :disabled="busy">启用提醒</NCheckbox>

      <div class="adm-actions">
        <NButton type="primary" :disabled="busy || loading || !room" @click="save">{{ editing ? "保存修改" : "添加提醒" }}</NButton>
        <NButton v-if="editing" :disabled="busy" @click="reset">取消编辑</NButton>
      </div>
    </PanelBlock>

    <PanelBlock title="已配置提醒">
      <p v-if="!data.rules.length" class="adm-empty">暂无提醒规则。</p>
      <article v-for="rule in data.rules" :key="rule.id" class="rule">
        <strong>{{ rule.campaignName }} / {{ rule.mapName }} · {{ rule.roomName }}</strong>
        <p class="adm-card-meta">{{ sideName(rule.side) }} · {{ rule.roomKey }} · {{ rule.enabled ? "已启用" : "已停用" }}</p>
        <p v-if="rule.extraText" class="extra">{{ rule.extraText }}</p>
        <div class="adm-actions">
          <NButton size="small" :disabled="busy" @click="edit(rule)">编辑</NButton>
          <NButton size="small" type="error" :disabled="busy" @click="mutate({ id: rule.id, remove: true })">删除</NButton>
        </div>
      </article>
    </PanelBlock>
  </div>
</template>

<style scoped>
.lede { margin: 0 0 var(--sp-4); font-size: var(--fs-sm); line-height: var(--lh-body); color: var(--fg-secondary); }
.rule { display: grid; gap: var(--sp-2); padding: var(--sp-3) 0; border-bottom: var(--hairline); }
.rule strong { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--fg-default); }
.extra { margin: 0; font-size: var(--fs-sm); color: var(--fg-secondary); white-space: pre-wrap; }
</style>
