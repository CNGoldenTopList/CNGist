<script setup lang="ts">
/** 后台各列表共用的分页。翻页只改页码，取数由调用方决定。 */
import { NPagination } from "naive-ui";

const page = defineModel<number>("page", { required: true });
defineProps<{ itemCount: number; pageSize?: number }>();
</script>

<template>
  <NPagination
    v-if="itemCount > (pageSize ?? 20)"
    v-model:page="page"
    class="pager"
    :page-size="pageSize ?? 20"
    :item-count="itemCount"
    show-quick-jumper
    size="small"
  />
</template>

<style scoped>
.pager { padding-top: var(--sp-3); }
</style>
