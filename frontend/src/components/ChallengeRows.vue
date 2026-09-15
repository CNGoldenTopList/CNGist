<script setup lang="ts">
/** 挑战行的容器。行与行之间一条细线，色脊连成一列。 */
</script>

<template>
  <ul class="rows"><slot /></ul>
</template>

<style scoped>
.rows { margin: 0; padding: 0; list-style: none; display: grid; }
.rows > :deep(li + li > a) { border-top: var(--hairline); }
</style>
