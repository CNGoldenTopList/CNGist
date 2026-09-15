<script setup lang="ts" generic="T extends { key: string; estimate: number }">
/** 使用页面滚动，按实际高度测量标题与列表行。 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from "vue";
import { useWindowVirtualizer } from "@tanstack/vue-virtual";

const props = defineProps<{ items: T[] }>();
const host = ref<HTMLElement>();
const margin = ref(0);
const virtualizer = useWindowVirtualizer<HTMLElement>(computed(() => ({
  count: props.items.length,
  getItemKey: (index: number) => props.items[index].key,
  estimateSize: (index: number) => props.items[index].estimate,
  overscan: 12,
  scrollMargin: margin.value,
})));
const visible = computed(() => virtualizer.value.getVirtualItems());
const height = computed(() => virtualizer.value.getTotalSize());
const measure = (element: Element | ComponentPublicInstance | null) => {
  if (element instanceof HTMLElement) virtualizer.value.measureElement(element);
};
let observer: ResizeObserver | undefined;
let width = 0;
function updateLayout() {
  if (!host.value) return;
  margin.value = host.value.getBoundingClientRect().top + window.scrollY;
  const nextWidth = host.value.clientWidth;
  if (nextWidth !== width) {
    width = nextWidth;
    virtualizer.value.measure();
  }
}
onMounted(() => {
  updateLayout();
  observer = new ResizeObserver(updateLayout);
  observer.observe(host.value!);
  if (host.value?.parentElement) observer.observe(host.value.parentElement);
  window.addEventListener("resize", updateLayout);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("resize", updateLayout);
});
// 排序、搜索或筛选后回到结果开头，避免停在旧列表末尾的空白区域。
watch(() => props.items, () => {
  updateLayout();
  if (window.scrollY > margin.value) window.scrollTo({ top: Math.max(0, margin.value - 140), behavior: "instant" });
}, { flush: "post" });
</script>

<template>
  <div ref="host" class="virtual-list" :style="{ height: `${height}px` }">
    <div
      v-for="row in visible"
      :key="String(row.key)"
      :ref="measure"
      :data-index="row.index"
      class="virtual-row"
      :style="{ transform: `translateY(${row.start - margin}px)` }"
    >
      <slot :item="items[row.index]" :index="row.index" />
    </div>
  </div>
</template>

<style scoped>
.virtual-list { position: relative; min-width: 0; overflow-anchor: none; }
.virtual-row { position: absolute; top: 0; left: 0; width: 100%; display: flow-root; }
</style>
