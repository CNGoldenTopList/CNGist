<script setup lang="ts">
/**
 * 区块容器 —— 页面的分节手段。
 *
 * 不画边框：分区靠标题下的一条细线、地面色差与留白。圆角只留给可交互元素。
 * 这一条是全站形态语言的地基，加卡片描边之前先想清楚为什么。
 */
withDefaults(defineProps<{
  title?: string;
  subtitle?: string;
  /** plain 与页面同地面；inset 下沉一档，用于嵌套的次级区块 */
  variant?: "plain" | "inset";
  /** 左侧色脊的颜色，传 Tier 色即可把难度标识带进区块标题 */
  rail?: string;
}>(), { variant: "plain" });
</script>

<template>
  <section class="panel" :class="[variant, { railed: rail }]" :style="rail ? { '--panel-rail': rail } : undefined">
    <header v-if="title || $slots.title" class="head">
      <div class="heading">
        <h2 class="title"><slot name="title">{{ title }}</slot></h2>
        <p v-if="subtitle || $slots.subtitle" class="subtitle"><slot name="subtitle">{{ subtitle }}</slot></p>
      </div>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </header>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.panel { display: block; min-width: 0; }

/* 区块之间的换气。:first-child 时不补，避免在自身就有间距的容器里首块下沉。 */
.panel:not(:first-child) { margin-top: var(--sp-6); }
.panel + .panel { margin-top: var(--sp-7); }

/* 下沉一档地面，用于区块内部的次级分组。仍然不加边框。 */
.inset {
  background: var(--bg-inset);
  border-radius: var(--r-md);
  padding: var(--sp-5);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-5);
  flex-wrap: wrap;
  padding-bottom: var(--sp-3);
  border-bottom: var(--hairline);
  margin-bottom: var(--sp-5);
}
.heading { min-width: 0; }
.title {
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.015em;
  color: var(--fg-default);
  text-wrap: balance;
}
.subtitle {
  margin: var(--sp-2) 0 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-snug);
  color: var(--fg-subtle);
  max-width: 62ch;
}
/* 操作区与标题基线对齐，因此按钮不会把标题行撑高 */
.actions { display: flex; align-items: center; gap: var(--sp-2); flex: 0 0 auto; }
.body { min-width: 0; }

/* 色脊：与页首品牌区、Tier 徽章同一条语言，颜色即难度。
   只在调用方明确传入 rail 时出现，避免每个区块都挂一条彩条。 */
.railed { padding-left: var(--sp-4); border-left: var(--rail-w) solid var(--panel-rail); }
.railed .head { margin-left: calc(var(--sp-4) * -1); padding-left: var(--sp-4); }
</style>
