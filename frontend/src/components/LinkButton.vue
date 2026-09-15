<script setup lang="ts">
/**
 * 按钮形状的站内链接。
 *
 * 用真正的 <a> 而不是 onClick 跳转：中键新开、右键复制地址、
 * 读屏器把它念成链接——这些都得靠 href 才成立。
 */
import { NButton } from "naive-ui";
import { RouterLink } from "vue-router";

defineProps<{
  to: string;
  type?: "default" | "primary" | "error" | "warning" | "info" | "success";
  size?: "tiny" | "small" | "medium" | "large";
  ghost?: boolean;
  quaternary?: boolean;
  block?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <RouterLink v-slot="{ href, navigate }" :to="to" custom>
    <NButton
      tag="a"
      :href="href"
      :type="type"
      :size="size"
      :ghost="ghost"
      :quaternary="quaternary"
      :block="block"
      :disabled="disabled"
      @click="navigate"
    >
      <slot />
    </NButton>
  </RouterLink>
</template>
