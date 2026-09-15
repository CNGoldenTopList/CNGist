<script setup lang="ts">
/**
 * API 文档。正文由后端的 `/api/reference.md` 提供 —— 文档与接口同源，
 * 不在前端另存一份会过时的副本。
 */
import { computed, onMounted, ref } from "vue";
import { marked } from "marked";

const source = ref("");
const failed = ref(false);

onMounted(async () => {
  try {
    const response = await fetch("/api/reference.md");
    if (!response.ok) throw new Error("unavailable");
    source.value = await response.text();
  } catch {
    failed.value = true;
  }
});

/** 二级标题按源文件行号生成锚点，目录与正文因此对得上。 */
const sections = computed(() => source.value.split("\n").flatMap((line, index) =>
  (line.startsWith("## ") ? [{ title: line.slice(3), id: `section-${index + 1}` }] : [])));

const html = computed(() => {
  if (!source.value) return "";
  let line = 0;
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((token) => ("raw" in token ? token.raw : "")).join("");
    const id = depth === 2 ? ` id="section-${++line}"` : "";
    return `<h${depth}${id}>${text}</h${depth}>`;
  };
  return marked.parse(source.value, { renderer, gfm: true, async: false }) as string;
});

/* 标题锚点要与目录一致：这里按源文件真实行号重算一遍。 */
const anchored = computed(() => {
  let result = html.value;
  sections.value.forEach((section, index) => {
    result = result.replace(`id="section-${index + 1}"`, `id="${section.id}"`);
  });
  return result;
});
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <nav aria-label="API 文档目录">
        <a class="home" href="#api-docs">API 文档</a>
        <a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
        <a class="source" href="/api/reference.md" download>下载 Markdown ↓</a>
      </nav>
    </aside>
    <article id="api-docs" class="document">
      <p v-if="failed">接口文档暂时取不到，请稍后再试。</p>
      <!-- eslint-disable-next-line vue/no-v-html -- 内容来自本站后端的静态文档，不含用户输入 -->
      <div v-else v-html="anchored" />
    </article>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--sp-6);
  max-width: 1240px;
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-6) 96px;
}

.sidebar { position: sticky; top: 84px; align-self: start; max-height: calc(100vh - 120px); overflow-y: auto; }
.sidebar nav { display: grid; gap: 2px; }
.sidebar a {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.sidebar a:hover { background: var(--bg-raised); color: var(--fg-default); }
.sidebar .home { font-weight: var(--fw-medium); color: var(--fg-default); }
.sidebar .source { margin-top: var(--sp-3); color: var(--link); }

.document { min-width: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--fg-secondary); }
.document :deep(h1) { font-family: var(--font-title); font-size: var(--fs-h1); font-weight: var(--fw-bold); color: var(--fg-default); margin: 0 0 var(--sp-5); }
.document :deep(h2) {
  font-family: var(--font-title);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  color: var(--fg-default);
  margin: var(--sp-7) 0 var(--sp-4);
  padding-bottom: var(--sp-2);
  border-bottom: var(--hairline);
  scroll-margin-top: 84px;
}
.document :deep(h3) { font-size: var(--fs-h3); font-weight: var(--fw-medium); color: var(--fg-default); margin: var(--sp-5) 0 var(--sp-3); }
.document :deep(p), .document :deep(ul), .document :deep(ol) { margin: 0 0 var(--sp-4); }
.document :deep(code) {
  font-family: var(--font-num);
  font-size: .92em;
  padding: 1px 5px;
  border-radius: var(--r-sm);
  background: var(--bg-inset);
  color: var(--fg-default);
}
.document :deep(pre) {
  margin: 0 0 var(--sp-4);
  padding: var(--sp-4);
  border-radius: var(--r-md);
  background: var(--bg-inset);
  overflow-x: auto;
}
.document :deep(pre code) { padding: 0; background: none; }
/* 行内 code 常常是一整条接口路径或长键名，默认不换行会把整页推宽 ——
   实测 /api 能横滚 400px。pre 里的代码不参与换行，那里由 pre 自己横滚。 */
.document :deep(:not(pre) > code) { overflow-wrap: anywhere; }
/* 表格自己横向滚动，页面主体永远不横滚。 */
.document :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 var(--sp-4); font-size: var(--fs-sm); display: block; overflow-x: auto; }
.document :deep(th), .document :deep(td) { padding: var(--sp-2) var(--sp-3); border-bottom: var(--hairline); text-align: left; vertical-align: top; }
.document :deep(th) { color: var(--fg-subtle); font-weight: var(--fw-medium); white-space: nowrap; }
.document :deep(blockquote) { margin: 0 0 var(--sp-4); padding-left: var(--sp-4); border-left: var(--rail-w) solid var(--accent-500); color: var(--fg-muted); }

@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .sidebar { position: static; max-height: none; }
}
</style>
