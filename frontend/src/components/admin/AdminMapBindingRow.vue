<script setup lang="ts">
/** 一条地图配对申请。折叠时只报「什么 SID 配到哪张图」，展开才给审核动作。 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { NButton, NInput } from "naive-ui";
import { formatBeijingDateTime } from "@shared/datetime";
import FormField from "@/components/FormField.vue";
import LinkButton from "@/components/LinkButton.vue";

type Binding = {
  id: number; sid: string; side: string; mapId: number;
  mapName: string; campaignName: string; proposedBy: string;
  createdAt: string; reviewedAt: string | null;
};

const props = defineProps<{ item: Binding; pending: boolean; open: boolean }>();
const emit = defineEmits<{ toggle: []; review: [note: string, reject: boolean] }>();

const note = ref("");
const busy = ref(false);
const detailId = computed(() => `binding-${props.item.id}`);
const sideLabel = (side: string) => ({ Normal: "A 面", BSide: "B 面", CSide: "C 面" }[side] ?? side);
const stamp = computed(() => (props.pending ? props.item.createdAt : props.item.reviewedAt ?? props.item.createdAt));

async function run(reject: boolean) {
  busy.value = true;
  try { emit("review", note.value.trim(), reject); }
  finally { busy.value = false; }
}
</script>

<template>
  <article class="node">
    <header class="head">
      <NButton size="small" quaternary :aria-label="open ? '收起配对' : '展开配对'" :aria-expanded="open" :aria-controls="detailId" @click="emit('toggle')">
        {{ open ? "−" : "+" }}
      </NButton>
      <button type="button" class="identity" :aria-expanded="open" :aria-controls="detailId" @click="emit('toggle')">
        <strong>{{ item.sid }}</strong>
        <span>{{ item.campaignName ? `${item.campaignName} / ` : "" }}{{ item.mapName }}</span>
      </button>
      <span class="side">{{ sideLabel(item.side) }}</span>
      <span class="meta">
        <span>{{ item.proposedBy || "—" }}</span>
        <time :datetime="stamp">{{ formatBeijingDateTime(stamp) }}</time>
      </span>
      <LinkButton :to="`/map/${item.mapId}`" size="small">查看地图</LinkButton>
    </header>

    <div v-if="open" :id="detailId" class="detail">
      <dl class="mapping">
        <div><dt>游戏地图标识</dt><dd>{{ item.sid }} · {{ sideLabel(item.side) }}</dd></div>
        <div>
          <dt>配对到</dt>
          <dd><RouterLink :to="`/map/${item.mapId}`">{{ item.campaignName ? `${item.campaignName} / ` : "" }}{{ item.mapName }}</RouterLink></dd>
        </div>
      </dl>
      <FormField :label="pending ? '审核说明' : '撤销原因'">
        <NInput v-model:value="note" placeholder="可留空" :disabled="busy" :aria-label="pending ? '审核说明' : '撤销原因'" />
      </FormField>
      <div class="adm-actions">
        <template v-if="pending">
          <NButton size="small" type="primary" :disabled="busy" @click="run(false)">通过并全站生效</NButton>
          <NButton size="small" type="error" :disabled="busy" @click="run(true)">驳回</NButton>
        </template>
        <NButton v-else size="small" type="error" :disabled="busy" @click="run(true)">撤销配对</NButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.node { border: var(--hairline); border-radius: var(--r-md); background: var(--bg-surface); min-width: 0; }
.head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  flex-wrap: wrap;
}
/* SID 是这一行的主标识，配到哪张图是副行；两者都在同一个可点区域里。 */
.identity {
  display: grid;
  gap: 2px;
  flex: 1 1 240px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.identity strong { font-family: var(--font-num); font-size: var(--fs-sm); color: var(--fg-default); overflow-wrap: anywhere; }
.identity span { font-size: var(--fs-micro); color: var(--fg-subtle); }
.side { font-size: var(--fs-micro); color: var(--fg-muted); white-space: nowrap; }
.meta { display: grid; gap: 2px; font-size: var(--fs-micro); color: var(--fg-subtle); text-align: right; white-space: nowrap; }

.detail { display: grid; gap: var(--sp-3); padding: var(--sp-3); border-top: var(--hairline); }
.mapping { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-3); margin: 0; }
.mapping dt { font-size: var(--fs-micro); color: var(--fg-subtle); }
.mapping dd { margin: 0; font-size: var(--fs-sm); color: var(--fg-default); overflow-wrap: anywhere; }
</style>
