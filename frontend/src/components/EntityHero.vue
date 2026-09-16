<script setup lang="ts">
/**
 * 实体页头 —— 地图包页与地图页共用。
 *
 * 封面铺满页头做背景，文字压在渐变之上。这是全站唯一使用大面积图片的
 * 地方，因此也是唯一需要把地面压暗的地方：三段渐变保证任何封面下底部
 * 文字都有足够对比度，而顶部又不至于把画面压死。
 */
defineProps<{
  /** 类别：地图包 / 地图 */
  kicker: string;
  banner?: string;
}>();
</script>

<template>
  <header class="entity-hero">
    <div class="cover" :data-empty="banner ? undefined : true" aria-hidden="true">
      <img v-if="banner" :src="banner" alt="" />
    </div>
    <div class="content">
      <p class="kicker">{{ kicker }}</p>
      <!-- 双语模式下的中文名由 LocalizedName 渲染在标题内部，不要再单独传一行。 -->
      <h1 class="title"><slot name="title" /></h1>
      <p v-if="$slots.meta" class="meta"><slot name="meta" /></p>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<style scoped>
.entity-hero {
  position: relative;
  display: grid;
  min-height: 220px;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-surface);
  isolation: isolate;
}

.cover { position: absolute; inset: 0; z-index: -1; overflow: hidden; background: var(--bg-surface); }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 渐变压在图片之上。三段而非两段：任何封面下底部文字都能拿到足够对比度。 */
.cover::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hero-scrim);
}
/* 没有封面时不铺渐变：退回普通地面 */
.cover[data-empty]::after { display: none; }

.content {
  display: grid;
  gap: var(--sp-2);
  align-content: end;
  padding: var(--sp-6) var(--sp-5) var(--sp-5);
  min-width: 0;
}

.kicker {
  margin: 0;
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

/* 标题 32px；中文名沿用默认的 .8em 会得到 26px，明显过大。
   .5em 即 16px，与正文同档，且只作用于这个页头。 */
.title {
  --cn-size: .5em;
  margin: 0;
  font-family: var(--font-title);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -.02em;
  color: var(--fg-default);
  text-wrap: balance;
}

/* 归属信息：地图 → 所属地图包 */
.meta { margin: 0; font-size: var(--fs-sm); color: var(--fg-muted); }
.meta :deep(a) { color: var(--fg-secondary); }
@media (hover: hover) {
  .meta :deep(a:hover) { color: var(--link); }
}

.actions { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-3); }

@media (max-width: 640px) {
  .entity-hero { min-height: 180px; }
  .content { padding: var(--sp-5) var(--sp-4) var(--sp-4); }
}
</style>
