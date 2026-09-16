<script setup lang="ts">
/**
 * 标签编辑器。后台唯一的加标签入口：审核列表、玩家页与记录详情页都用它。
 *
 * 三段式：预设一键落标签（覆盖绝大多数场景）、自由输入 + 取色器兜底罕见标签、
 * 已有标签就地改名与拖动排序。预设词表在 shared/review-tags，与服务端同源。
 *
 * `onAppend` 决定「添加」走哪条写路径。不传（草稿模式）就只改本地数组，等外层
 * 一次性提交；传了（即时模式）就由外层单条追加，不必把整份标签数组发回去覆盖 ——
 * 后者在两个管理员同时改同一条记录时会互相清掉对方刚加的标签。
 */
import { computed, ref } from "vue";
import { NButton, NColorPicker, NInput } from "naive-ui";
import { fixedTagColor, PRESET_BADGE_TAGS, PRESET_NOTE_TAGS, tagIdentity } from "@shared/review-tags";
import type { ReviewTag } from "@shared/admin";

const props = defineProps<{
  tags: ReviewTag[];
  onChange: (tags: ReviewTag[]) => void;
  onAppend?: (tag: Omit<ReviewTag, "id">) => Promise<boolean>;
}>();

/**
 * 常用色。这不是可选颜色的全集 —— 旁边的取色器能取任意颜色，这一排只是
 * 免去「打开取色器→拖游标→确认」三步的快捷方式。FC／DTS 那几个语义色不在
 * 这里：它们的颜色由 fixedTagColor 决定，选了也不生效。
 */
const tagColors: Array<[string, string]> = [
  ["红", "#ff6b6b"], ["橙", "#ff9f43"], ["金", "#f6c453"], ["黄", "#ffe66d"],
  ["绿", "#63d471"], ["青", "#4dd9c0"], ["天蓝", "#67c9ff"], ["蓝", "#5794ff"],
  ["靛", "#6f7bff"], ["紫", "#b47cff"], ["灰", "#c5cbd3"],
];

const text = ref("");
const color = ref("#67c9ff");
const editingId = ref<number | null>(null);
const editText = ref("");
const dragId = ref<number | null>(null);
const paletteOpen = ref(false);
const busy = ref(false);
const notice = ref("");

const has = (value: string) => props.tags.some((tag) => tagIdentity(tag.text) === tagIdentity(value));
/* 输入中的文字若是语义固定的标签，取色器就地失效并说明原因 —— 让它照常可点、
   加完却是另一个颜色，比禁用更难懂。 */
const forcedColor = computed(() => fixedTagColor(text.value));

/** 预设与手动输入共用这一条写路径，两者的查重、写库与提示才会一致。 */
async function commit(draft: Omit<ReviewTag, "id">) {
  if (busy.value) return false;
  if (has(draft.text)) { notice.value = `已经有「${draft.text}」这个标签了。`; return false; }
  notice.value = "";
  if (!props.onAppend) {
    props.onChange([...props.tags, { id: Date.now() + Math.floor(Math.random() * 1000), ...draft }]);
    return true;
  }
  busy.value = true;
  try { return await props.onAppend(draft); }
  finally { busy.value = false; }
}

/* badge 的颜色三级取值：语义固定的标签用它们自己的色，预设带的默认色次之，
   最后才是调色板当前选中的色 —— 预设的默认色只是默认，加完还能改。 */
const draftFor = (value: string, kind: ReviewTag["kind"], preset?: string): Omit<ReviewTag, "id"> => ({
  kind,
  text: value,
  color: kind === "badge" ? fixedTagColor(value) || preset || color.value : undefined,
});

async function add(kind: ReviewTag["kind"]) {
  const value = text.value.trim();
  if (!value) return;
  if (await commit(draftFor(value, kind))) text.value = "";
}

function dropBefore(targetId: number) {
  if (dragId.value === null || dragId.value === targetId) return;
  const moving = props.tags.find((tag) => tag.id === dragId.value);
  if (!moving) return;
  const rest = props.tags.filter((tag) => tag.id !== dragId.value);
  const target = rest.findIndex((tag) => tag.id === targetId);
  rest.splice(Math.max(0, target), 0, moving);
  props.onChange(rest);
  dragId.value = null;
}

function startEdit(tag: ReviewTag) {
  editingId.value = tag.id;
  editText.value = tag.text;
}

function saveEdit(tagId: number) {
  const value = editText.value.trim();
  if (value) {
    props.onChange(props.tags.map((tag) => (tag.id === tagId
      ? { ...tag, text: value, color: tag.kind === "badge" ? fixedTagColor(value) || tag.color : undefined }
      : tag)));
  }
  editingId.value = null;
}

const badgePresets = PRESET_BADGE_TAGS;
const notePresets = PRESET_NOTE_TAGS;
</script>

<template>
  <div class="control">
    <div class="strip">
      <span
        v-for="tag in tags"
        :key="tag.id"
        class="tag"
        :data-kind="tag.kind"
        :style="tag.kind === 'badge' ? { '--tag-tone': tag.color } : undefined"
        draggable="true"
        @dragstart="dragId = tag.id"
        @dragover.prevent
        @drop="dropBefore(tag.id)"
      >
        <template v-if="editingId === tag.id">
          <NInput
            v-model:value="editText"
            size="tiny"
            autofocus
            class="inline-input"
            @blur="saveEdit(tag.id)"
            @keydown.enter="saveEdit(tag.id)"
            @keydown.esc="editingId = null"
          />
        </template>
        <!-- 文字本身就是改名入口：再立一个「改」按钮，一排下来全是噪音。 -->
        <span v-else role="button" tabindex="0" class="tag-text" title="点击改名" @click="startEdit(tag)" @keydown.enter.prevent="startEdit(tag)">
          {{ tag.text }}
        </span>
        <button type="button" class="remove" :aria-label="`删除标签 ${tag.text}`" title="删除" @click="onChange(tags.filter((item) => item.id !== tag.id))">×</button>
      </span>
      <span v-if="!tags.length" class="empty">还没有标签。点下面的常用标签即可添加。</span>
    </div>

    <!-- 三行共用一个两列网格：行首那两个字既说明这一行加的是什么，也让三行
         内容对齐成一条竖直边。预设一点即加 —— 这批文字是权威写法，进输入框
         再让人改一遍反而会改出各种变体。 -->
    <div class="rows">
      <span class="row-label" id="tag-preset-badge">颜色</span>
      <div class="chips" role="group" aria-labelledby="tag-preset-badge">
        <button
          v-for="preset in badgePresets"
          :key="preset.text"
          type="button"
          class="preset"
          data-kind="badge"
          :style="{ '--tag-tone': preset.color }"
          :disabled="has(preset.text) || busy"
          :title="has(preset.text) ? `已经有「${preset.text}」这个标签了` : `添加颜色标签「${preset.text}」`"
          @click="commit(draftFor(preset.text, 'badge', preset.color))"
        >{{ preset.text }}</button>
      </div>

      <span class="row-label" id="tag-preset-note">说明</span>
      <div class="chips" role="group" aria-labelledby="tag-preset-note">
        <button
          v-for="preset in notePresets"
          :key="preset"
          type="button"
          class="preset"
          data-kind="note"
          :disabled="has(preset) || busy"
          :title="has(preset) ? `已经有「${preset}」这个标签了` : `添加说明标签「${preset}」`"
          @click="commit(draftFor(preset, 'note'))"
        >{{ preset }}</button>
      </div>

      <!-- 预设以外的标签。类型不是先选的档位，而是两个「加什么」的按钮：
           写完文字再决定它是彩色的还是说明，比先切档再打字少一步。 -->
      <span aria-hidden="true" />
      <div class="custom">
        <NInput
          v-model:value="text"
          class="text-input"
          placeholder="预设以外的标签，如 视频 16:45 处开始"
          @update:value="notice = ''"
          @keydown.enter="add('note')"
        />
        <button
          type="button"
          class="color-trigger"
          :aria-expanded="paletteOpen"
          :disabled="Boolean(forcedColor)"
          :title="forcedColor ? '这个标签的颜色全站统一' : '选择颜色标签的颜色'"
          @click="paletteOpen = !paletteOpen"
        >
          <span class="color-dot" :style="{ '--tag-tone': forcedColor || color }" />
          颜色
        </button>
        <NButton :loading="busy" @click="add('badge')">加颜色标签</NButton>
        <!-- 自由输入的多半是「视频 16:45 处开始」这类说明，所以回车走这一个。 -->
        <NButton :loading="busy" title="回车" @click="add('note')">加说明标签</NButton>
      </div>

      <div v-if="paletteOpen && !forcedColor" class="palette" role="radiogroup" aria-label="标签颜色">
        <button
          v-for="[label, value] in tagColors"
          :key="value"
          type="button"
          role="radio"
          :aria-checked="color === value"
          :aria-label="label"
          :title="`${label} ${value}`"
          class="swatch"
          :style="{ background: value }"
          @click="color = value; paletteOpen = false"
        />
        <NColorPicker to="body" v-model:value="color" :modes="['hex']" :show-alpha="false" size="small" class="picker" aria-label="自定义颜色" />
      </div>
    </div>

    <small v-if="forcedColor" class="hint">「{{ text.trim() }}」的颜色全站统一，不用在这里选。</small>
    <small v-if="notice" class="hint" role="status">{{ notice }}</small>
  </div>
</template>

<style scoped>
.control { display: grid; gap: var(--sp-3); min-width: 0; }

.strip { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); min-height: var(--ctl-sm); }
/* 颜色标签是实心描边，说明标签是中性描边并带一个「!」—— 形态区分，不靠色相。 */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border: 1px solid var(--tag-tone, var(--border-default));
  border-radius: var(--r-sm);
  font-size: var(--fs-micro);
  color: var(--tag-tone, var(--fg-muted));
  cursor: grab;
}
.tag[data-kind="note"] { --tag-tone: var(--fg-subtle); }
.tag[data-kind="note"]::before { content: "!"; font-weight: var(--fw-bold); opacity: .7; }
.tag-text { cursor: text; }
.remove { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; opacity: .7; padding: 0 2px; }
.remove:hover { opacity: 1; }
.inline-input { width: 140px; }
.empty { font-size: var(--fs-micro); color: var(--fg-disabled); }

.rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-2) var(--sp-3); align-items: center; }
.row-label { font-size: var(--fs-micro); color: var(--fg-subtle); white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.preset {
  height: var(--ctl-sm);
  padding: 0 var(--sp-2);
  border: 1px solid var(--tag-tone, var(--border-default));
  border-radius: var(--r-sm);
  background: transparent;
  font: inherit;
  font-size: var(--fs-micro);
  color: var(--tag-tone, var(--fg-muted));
  cursor: pointer;
}
.preset[data-kind="note"]::before { content: "!"; margin-right: 3px; font-weight: var(--fw-bold); opacity: .7; }
.preset:disabled { opacity: .35; cursor: not-allowed; }

/* 这一行的控件统一 --ctl-md，与上面两行的 chip（--ctl-sm）两档高度把
   「点一下」和「自己写」分开。 */
.custom { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.text-input { flex: 1 1 240px; min-width: 200px; }
.color-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--ctl-md);
  padding: 0 var(--sp-3);
  border: 1px solid var(--border-default);
  border-radius: var(--r-sm);
  background: transparent;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  cursor: pointer;
}
.color-trigger:disabled { opacity: .5; cursor: not-allowed; }
.color-dot { width: 12px; height: 12px; border-radius: 3px; background: var(--tag-tone); }

.palette { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.swatch { width: 22px; height: 22px; border: 1px solid rgb(0 0 0 / .25); border-radius: var(--r-sm); cursor: pointer; }
.picker { width: 96px; }

.hint { font-size: var(--fs-micro); color: var(--fg-subtle); }
</style>
