<script setup lang="ts">
/**
 * 已授权的设备，以及保存开关和删除数据。
 *
 * 这里是玩家唯一能关掉上传、撤销设备、删除已保存统计的地方 —— 授权页只能
 * 开启，关闭必须在自己账户里，不受任何设备影响。
 */
import { computed, onMounted, ref } from "vue";
import { NButton } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n";
import { confirmAction, toast } from "@/lib/feedback";
import PanelBlock from "@/components/PanelBlock.vue";

type Device = {
  id: number; name: string; clientName: string;
  createdAt: string; lastSeenAt: string | null; revokedAt: string | null;
};

const { t, apiError } = useLanguage();
const devices = ref<Device[]>([]);
const busy = ref(false);

async function reload() {
  const { ok, data } = await api.get<{ devices?: Device[] }>("/api/tracker/devices");
  if (ok) devices.value = data.devices ?? [];
}
onMounted(reload);

async function send(path: string, method: "PATCH" | "DELETE", success: string, body?: unknown) {
  busy.value = true;
  const result = method === "PATCH" ? await api.patch(path, body) : await api.delete(path, body);
  busy.value = false;
  if (!result.ok) { toast.error(apiError(result.data)); return false; }
  toast.success(success);
  await reload();
  return true;
}

const live = computed(() => devices.value.filter((item) => !item.revokedAt));

function seenLabel(device: Device) {
  if (device.revokedAt) return t("devices.revokedAt", { at: formatBeijingDateTime(device.revokedAt) });
  return device.lastSeenAt ? t("devices.lastSeen", { at: formatBeijingDateTime(device.lastSeenAt) }) : t("devices.neverSeen");
}

async function wipe() {
  const confirmed = await confirmAction({
    title: t("devices.wipe"),
    content: t("devices.wipeNote"),
    positiveText: t("devices.wipeConfirm"),
    negativeText: t("devices.wipeCancel"),
    danger: true,
  });
  if (!confirmed) return;
  await send("/api/tracker/preferences", "DELETE", t("devices.wipeDone"));
}
</script>

<template>
  <!-- 一台设备都没授权过时，这块对玩家没有意义，不占位置。 -->
  <PanelBlock v-if="devices.length" :title="t('devices.title')" :subtitle="t('devices.lede')">
    <ul class="rows">
      <li v-for="device in devices" :key="device.id" class="row">
        <span class="who">
          <b class="name">{{ device.name }}</b>
          <span v-if="device.clientName" class="client">{{ device.clientName }}</span>
        </span>
        <span class="when">{{ seenLabel(device) }}</span>
        <!-- 已撤销的行保留在列表里，但明确弱化，不要看着像还能用。 -->
        <span v-if="device.revokedAt" class="revoked">{{ t("devices.revoked") }}</span>
        <NButton
          v-else
          size="small"
          type="error"
          :disabled="busy"
          @click="send(`/api/tracker/devices/${device.id}`, 'DELETE', t('devices.revokeDone'))"
        >{{ t("devices.revoke") }}</NButton>
      </li>
    </ul>

    <div class="controls">
      <NButton
        v-if="live.length"
        :disabled="busy"
        @click="send('/api/tracker/preferences', 'PATCH', t('devices.savingOff'), { saveHistory: false })"
      >{{ t("devices.stopSaving") }}</NButton>
      <NButton
        v-else
        :disabled="busy"
        @click="send('/api/tracker/preferences', 'PATCH', t('devices.savingOn'), { saveHistory: true })"
      >{{ t("devices.resumeSaving") }}</NButton>
      <NButton quaternary :disabled="busy" @click="wipe">{{ t("devices.wipe") }}</NButton>
    </div>
    <p class="fine">{{ t("devices.wipeNote") }}</p>
  </PanelBlock>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: var(--sp-3); margin: 0 0 var(--sp-5); padding: 0; list-style: none; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: var(--sp-3); }

.who { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
.name { font-weight: var(--fw-medium); color: var(--fg-default); overflow-wrap: anywhere; }
.client { font-size: var(--fs-micro); color: var(--fg-subtle); }

.when { font-size: var(--fs-sm); color: var(--fg-subtle); font-variant-numeric: var(--num-tabular); white-space: nowrap; }
.revoked { font-size: var(--fs-sm); color: var(--fg-disabled); white-space: nowrap; }

.controls { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
.fine { margin: var(--sp-3) 0 0; font-size: var(--fs-micro); line-height: var(--lh-body); color: var(--fg-subtle); }

@media (max-width: 640px) {
  .row { grid-template-columns: 1fr auto; }
  .when { grid-column: 1 / -1; }
}
</style>
