<script setup lang="ts">
/** 窄屏使用可输入页码的简洁分页，避免完整页码与跳页框撑开列表。 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { NPagination } from "naive-ui";

const compact = ref(false);
let media: MediaQueryList | undefined;
const syncCompact = () => { compact.value = media?.matches ?? false; };
onMounted(() => {
  media = window.matchMedia("(max-width: 760px)");
  syncCompact();
  media.addEventListener("change", syncCompact);
});
onBeforeUnmount(() => media?.removeEventListener("change", syncCompact));
</script>

<template>
  <NPagination class="pagination" :simple="compact" />
</template>

<style scoped>
.pagination {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  row-gap: var(--sp-2);
}
</style>
