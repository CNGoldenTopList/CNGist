<script setup lang="ts">
/**
 * 带内联元素的文案。整句存在词典里，`{link}` 这样的占位由同名具名插槽填。
 * 翻译文本永远当纯文本处理，绝不当 HTML 渲染。
 */
import { computed } from "vue";
import { message } from "@shared/i18n/format";
import { useLanguage, type MessageKey } from "@/i18n";

const props = defineProps<{ id: MessageKey }>();
const { locale } = useLanguage();

const parts = computed(() =>
  message(locale.value, props.id).split(/(\{\w+\})/g).map((text, index) => ({
    index,
    text,
    slot: /^\{(\w+)\}$/.exec(text)?.[1],
  })));
</script>

<template>
  <template v-for="part in parts" :key="part.index">
    <slot v-if="part.slot && $slots[part.slot]" :name="part.slot" />
    <template v-else>{{ part.text }}</template>
  </template>
</template>
