<script setup lang="ts">
/**
 * 常见问题。条目由管理员在本页维护，存在数据库里 —— 所以它是数据，不进词典。
 * 管理员开启管理模式后可以就地新增、编辑或删除。
 */
import { computed, onMounted, ref } from "vue";
import { NButton, NInput, NInputNumber, NSelect } from "naive-ui";
import { storeToRefs } from "pinia";
import { qaCategories, type QaCategory } from "@shared/qa";
import { api } from "@/lib/api";
import { sendAdminCommand } from "@/lib/admin-api";
import { confirmAction, toast } from "@/lib/feedback";
import { useLanguage, type MessageKey } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import PageShell from "@/components/PageShell.vue";
import PanelBlock from "@/components/PanelBlock.vue";
import FormField from "@/components/FormField.vue";

type QaItem = {
  id: number; category: QaCategory; question: string; answer: string;
  questionEn?: string | null; answerEn?: string | null; position: number;
};
type Draft = { id: number | null; category: QaCategory; question: string; answer: string; questionEn: string; answerEn: string; position: number | null };

/** 分组标题；问答内容是数据，但这两个分组名是界面词典里的固定文案。 */
const categoryLabel: Record<QaCategory, MessageKey> = { rules: "qa.rules", general: "qa.general" };

const { t, locale } = useLanguage();
const { isAdmin, adminMode } = storeToRefs(useSessionStore());

const entries = ref<QaItem[]>([]);
const draft = ref<Draft | null>(null);
const busy = ref(false);

// 前台页面上的后台入口，与实体页的管理工具一致：只有开着管理模式的管理员看得到。
const editable = computed(() => isAdmin.value && adminMode.value);

async function load() {
  const { ok, data } = await api.get<{ entries?: QaItem[] }>("/api/qa");
  if (ok) entries.value = data.entries ?? [];
}
onMounted(load);

/** 英文留空时回退中文，避免英文站出现空条目。 */
const localized = (zh: string, en?: string | null) => (locale.value === "en" && en?.trim() ? en : zh);

const groups = computed(() => qaCategories.map((category) => ({
  category,
  items: entries.value.filter((item) => item.category === category).sort((a, b) => a.position - b.position),
})));

const categoryOptions = computed(() => qaCategories.map((category) => ({ value: category, label: t(categoryLabel[category]) })));

function startNew(category: QaCategory) {
  draft.value = { id: null, category, question: "", answer: "", questionEn: "", answerEn: "", position: null };
}
function startEdit(item: QaItem) {
  draft.value = {
    id: item.id, category: item.category, question: item.question, answer: item.answer,
    questionEn: item.questionEn ?? "", answerEn: item.answerEn ?? "", position: item.position,
  };
}

async function run(body: Record<string, unknown>, done: string) {
  busy.value = true;
  try {
    await sendAdminCommand("/api/admin/qa", { body });
    draft.value = null;
    toast.success(done);
    await load();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
  } finally {
    busy.value = false;
  }
}

function save() {
  const current = draft.value;
  if (!current) return;
  void run({
    id: current.id ?? undefined,
    category: current.category,
    question: current.question,
    answer: current.answer,
    questionEn: current.questionEn,
    answerEn: current.answerEn,
    position: current.position ?? undefined,
  }, "已保存。");
}

async function remove(item: QaItem) {
  const confirmed = await confirmAction({
    title: "删除问答",
    content: `确认删除问答「${item.question}」？`,
    positiveText: "删除",
    negativeText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  void run({ id: item.id, remove: true }, "已删除。");
}
</script>

<template>
  <PageShell eyebrow="Q&A" :title="t('qa.title')">
    <!-- 空分组只对管理员显示，否则前台会多出一块什么都没有的面板。 -->
    <PanelBlock v-for="group in groups" v-show="group.items.length || editable" :key="group.category" :title="t(categoryLabel[group.category])">
      <template v-if="editable" #actions>
        <!-- 新增按钮带上本分组，管理员不必再去下拉里选一次。 -->
        <NButton size="small" :disabled="busy" @click="startNew(group.category)">新增条目</NButton>
      </template>

      <p v-if="!group.items.length" class="a">{{ t("qa.empty") }}</p>
      <div v-else class="list">
        <details v-for="item in group.items" :key="item.id" class="item">
          <summary class="q">{{ localized(item.question, item.questionEn) }}</summary>
          <p class="a">{{ localized(item.answer, item.answerEn) }}</p>
          <div v-if="editable" class="tools">
            <NButton size="tiny" :disabled="busy" @click="startEdit(item)">编辑</NButton>
            <NButton size="tiny" type="error" :disabled="busy" @click="remove(item)">删除</NButton>
          </div>
        </details>
      </div>
    </PanelBlock>

    <PanelBlock v-if="draft" :title="draft.id ? '编辑问答' : '新增问答'">
      <form class="editor" @submit.prevent="save">
        <FormField label="分组" required>
          <NSelect v-model:value="draft.category" :options="categoryOptions" :disabled="busy" aria-label="分组" />
        </FormField>
        <FormField label="问题" required wide>
          <NInput v-model:value="draft.question" :maxlength="300" :disabled="busy" show-count />
        </FormField>
        <FormField label="回答" required wide>
          <NInput v-model:value="draft.answer" type="textarea" :rows="6" :maxlength="8000" :disabled="busy" />
        </FormField>
        <FormField label="英文问题" hint="留空则英文界面沿用中文内容。" wide>
          <NInput v-model:value="draft.questionEn" :maxlength="300" :disabled="busy" />
        </FormField>
        <FormField label="英文回答" hint="留空则英文界面沿用中文内容。" wide>
          <NInput v-model:value="draft.answerEn" type="textarea" :rows="6" :maxlength="8000" :disabled="busy" />
        </FormField>
        <FormField label="排序" hint="数值小的排在前面；留空则新条目排到本分组末尾。">
          <NInputNumber v-model:value="draft.position" :min="-9999" :max="9999" :disabled="busy" class="full" />
        </FormField>
        <div class="tools editor-tools">
          <NButton attr-type="submit" type="primary" :loading="busy" :disabled="!draft.question.trim() || !draft.answer.trim()">保存</NButton>
          <NButton attr-type="button" :disabled="busy" @click="draft = null">取消</NButton>
        </div>
      </form>
    </PanelBlock>
  </PageShell>
</template>

<style scoped>
/* 折叠三角自绘，原生 marker 各浏览器形状不一。 */
.list { display: grid; border-top: var(--hairline); }
.item { border-bottom: var(--hairline); }

.q {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-1);
  font-size: var(--fs-lead);
  font-weight: var(--fw-medium);
  color: var(--fg-default);
  cursor: pointer;
  list-style: none;
}
.q::-webkit-details-marker { display: none; }
.q::before {
  content: "";
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--fg-subtle);
  border-bottom: 1.5px solid var(--fg-subtle);
  transform: rotate(-45deg);
  transition: transform var(--dur-fast) var(--ease);
}
.item[open] .q::before { transform: translateY(-2px) rotate(45deg); }
.q:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }

.a {
  margin: 0;
  padding: 0 var(--sp-1) var(--sp-4) var(--sp-5);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--fg-secondary);
  white-space: pre-wrap;
}

/* 管理模式下的编辑入口与编辑表单，只有管理员看得到。 */
.tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); padding: 0 var(--sp-1) var(--sp-4) var(--sp-5); }
.editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3) var(--sp-4); }
.editor-tools { grid-column: 1 / -1; padding: 0; }
.full { width: 100%; }

@media (max-width: 640px) {
  .editor { grid-template-columns: minmax(0, 1fr); }
}
</style>
