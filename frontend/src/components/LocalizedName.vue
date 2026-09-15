<script setup lang="ts">
/**
 * 双语名称。
 *
 * 两条继承规则代替了改造前约 90 条全局规则：
 *   颜色 —— 从父级继承，中文名取父级颜色的 68%
 *   字号 —— 相对父级的 em，调用方用 --cn-size 覆盖
 * 于是任何新场景都不需要再往全局表里加规则，改父级即可。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useDisplayStore } from "@/stores/display";
import { displayMapName, resolveChineseName } from "@/lib/names";

const props = withDefaults(defineProps<{
  name: string;
  cnName?: string;
  /** 横排：中英文并列一行。默认是上下两行。 */
  inline?: boolean;
  /** 超长时省略号截断，用于表格与固定槽位 */
  truncate?: boolean;
  aliases?: string[];
}>(), { aliases: () => [] });

const { nameMode, onlyOfficialChinese } = storeToRefs(useDisplayStore());

const resolvedCnName = computed(() => resolveChineseName(props.name, props.cnName, props.aliases, onlyOfficialChinese.value));
const cnOnly = computed(() => nameMode.value === "cn" && !!resolvedCnName.value);
</script>


<template>
  <!-- 类名一律带 ln- 前缀：这个组件的根节点会同时带上调用方的 scope id，
       裸类名（.name / .inline）会被调用方的作用域样式误伤。 -->
  <span class="ln-root" :class="{ 'ln-inline': inline, 'ln-truncate': truncate }">
    <span v-if="!cnOnly" class="ln-original">{{ displayMapName(name) }}</span>
    <span v-if="nameMode !== 'en' && resolvedCnName" class="ln-cn">{{ resolvedCnName }}</span>
  </span>
</template>

<style scoped>
.ln-root { display: grid; gap: 2px; min-width: 0; }

/* 横排：中英文并列。允许换行，因为容器宽度不由这里决定；
   需要单行的场景请同时传 truncate。 */
.ln-inline {
  display: inline-flex;
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.ln-original { min-width: 0; }

.ln-cn {
  min-width: 0;
  /* 默认 .8em。调用方用 --cn-size 覆盖 —— 页头标题是 32px，
     沿用 .8em 会得到 26px 的中文名，那明显过大。 */
  font-size: var(--cn-size, .8em);
  /* 同为 600，汉字每字的笔画密度远高于拉丁字母，看起来接近 800，
     所以字重也留给调用方用 --cn-weight 覆盖。 */
  font-weight: var(--cn-weight, var(--fw-medium));
  line-height: 1.3;
  letter-spacing: .01em;
  color: color-mix(in srgb, currentColor 68%, transparent);
}

/* 纯中文模式下中文名就是主名，不该被弱化。 */
.ln-root:has(.ln-cn:only-child) .ln-cn {
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
}

/* 省略号只在盒子有上限时才会出现。横排时根节点是 inline-flex，宽度按
   内容算，不加这条上限的话子元素永远不必收缩，长名字会顶出容器。 */
.ln-truncate { max-width: 100%; }

.ln-truncate .ln-original,
.ln-truncate .ln-cn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
