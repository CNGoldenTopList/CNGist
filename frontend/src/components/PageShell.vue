<script setup lang="ts">
/**
 * 页面外壳 —— 宽度、留白与页头的唯一实现。
 *
 * 三档宽度，其余一律不许再自定义：
 *   text  阅读与表单（680px，约 75 个汉字一行）
 *   wide  需要横向对比的表格（1100px）
 *   full  金榜矩阵这类必须尽量铺开的
 */
withDefaults(defineProps<{
  /** 类别标签，如「地图目录」「反馈问题」 */
  eyebrow?: string;
  title?: string;
  /** 一句话说明这一页是干什么的 */
  lede?: string;
  width?: "text" | "wide" | "full";
}>(), { width: "text" });
</script>

<template>
  <div class="page" :class="width">
    <header v-if="title || $slots.title" class="head">
      <div class="head-text">
        <p v-if="eyebrow || $slots.eyebrow" class="eyebrow"><slot name="eyebrow">{{ eyebrow }}</slot></p>
        <h1 class="title"><slot name="title">{{ title }}</slot></h1>
        <p v-if="lede || $slots.lede" class="lede"><slot name="lede">{{ lede }}</slot></p>
      </div>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.page {
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-7) 96px;
  display: grid;
  gap: var(--sp-6);
  align-content: start;
  min-width: 0;
}

.text { max-width: 680px; }
.wide { max-width: 1100px; }
.full { max-width: none; }

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-5);
  flex-wrap: wrap;
}
.head-text { display: grid; gap: var(--sp-3); min-width: 0; }

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
.lede {
  margin: 0;
  max-width: 60ch;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--fg-secondary);
}
.actions { display: flex; align-items: center; gap: var(--sp-2); flex: 0 0 auto; }

@media (max-width: 640px) {
  .page { padding-inline: var(--sp-4); padding-block: var(--sp-5) 72px; gap: var(--sp-5); }
}
</style>
