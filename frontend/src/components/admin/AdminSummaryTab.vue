<script setup lang="ts">
import LinkButton from "@/components/LinkButton.vue";
import PanelBlock from "@/components/PanelBlock.vue";
</script>
<template>
  <PanelBlock title="每日总结">
    <p>每日总结按北京时间前一天 22:30 至当天 22:30 汇总通过记录，包含 Standard。</p>
    <LinkButton to="/daily-summary" type="primary">查看每日总结</LinkButton>
  </PanelBlock>
</template>
