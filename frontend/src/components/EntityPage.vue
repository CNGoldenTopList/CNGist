<script setup lang="ts">
/**
 * 实体页（地图包 / 地图 / 多地图挑战 / 玩家 / 记录）的页面骨架。
 *
 * 宽度与提交页、意见箱一致（680px）：这几页是「读一个条目的信息」，
 * 不是「在几百条里检索」，铺满宽屏只会让眼睛左右横扫。
 * 需要宽度的是 /maps 那种目录页，不是这里。
 */
</script>

<template>
  <div class="page"><slot /></div>
</template>

<style scoped>
.page {
  max-width: 680px;
  margin: 0 auto;
  padding-inline: var(--sp-5);
  padding-block: var(--sp-6) 96px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  gap: var(--sp-6);
  min-width: 0;
}

@media (max-width: 640px) {
  .page { padding-inline: var(--sp-4); padding-block: var(--sp-4) 72px; gap: var(--sp-5); }
}
</style>
