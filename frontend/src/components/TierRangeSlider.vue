<script setup lang="ts">
/**
 * 难度区间选择。轨道本身就是 17 档 Tier 色谱，拖到哪里就是筛到哪一档。
 *
 * 改造前这里是两百行自绘的双滑块：指针捕获、两个手柄重叠时的方向判定、
 * 提示气泡的显隐全是手写的。现在底座换成 NSlider 的 range 模式 ——
 * 键盘、触摸、指针捕获都由它保证，这里只保留色谱轨道和档位刻度。
 *
 * 值是 tierOrder 的下标：0 最难，16 最易。
 */
import { computed } from "vue";
import { NSlider } from "naive-ui";
import { storeToRefs } from "pinia";
import { tierMeta, tierOrder } from "@shared/tiers";
import { useLanguage } from "@/i18n";
import { useDisplayStore } from "@/stores/display";

const lower = defineModel<number>("lower", { required: true });
const upper = defineModel<number>("upper", { required: true });
withDefaults(defineProps<{ dense?: boolean }>(), { dense: false });

const { t } = useLanguage();
const { compactTierLabels, tierColors } = storeToRefs(useDisplayStore());

const max = tierOrder.length - 1;
const displayTier = (index: number) =>
  compactTierLabels.value ? tierMeta[tierOrder[index]].short : tierMeta[tierOrder[index]].label;

/*
 * 压暗在这里算，而不是给轨道加 filter：CSS 滤镜会连着子元素一起生效，
 * 选中段是轨道的子节点，加了滤镜就再也亮不回来。
 *
 * 认不出的颜色原样返回 —— 自定义配色顶多不压暗，不会把渐变整条写坏。
 */
const GROUND = [0x15, 0x18, 0x1d];
const KEEP = .42;
function dim(color: string) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  const full = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join("") : hex[1];
  const channels = [0, 2, 4].map((at, index) =>
    Math.round(parseInt(full.slice(at, at + 2), 16) * KEEP + GROUND[index] * (1 - KEEP)));
  return `rgb(${channels.join(" ")})`;
}

/** 色标落在每一档刻度上；`span` 把 0–1 的档位位置映射到某段宽度里。 */
const ramp = (from: number, span: number, tone: (color: string) => string = (color) => color) => {
  const stops = tierOrder.map((tier, index) =>
    `${tone(tierColors.value[tier])} ${((index / max - from) / span * 100).toFixed(2)}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
};

/** 轨道底色是整条 Tier 光谱，压暗一档当底。 */
const gradient = computed(() => ramp(0, 1, dim));

/*
 * 选中段的渐变按它自己的宽度重算一遍。
 *
 * 填充块的背景是以它自身的盒子为坐标系画的，直接把整条光谱贴上去会被
 * 拉伸，颜色和底下的轨道对不上。所以把档位位置换算进 [lower, upper]
 * 这一段的局部坐标 —— 超出 0–100% 的色标 CSS 会照样插值，于是两层
 * 渐变严格重合，只差饱和度。
 */
const fillGradient = computed(() => {
  const from = lower.value / max;
  const span = (upper.value - lower.value) / max;
  return span > 0 ? ramp(from, span) : tierColors.value[tierOrder[lower.value]];
});

/* 只给每个 Tier 组的首档打标：17 个刻度全写上去会糊成一片。 */
const marks = computed(() => {
  const groupStarts = [0, 1, 4, 7, 10, 13, 14, 15, 16];
  return Object.fromEntries(groupStarts.map((index) => [index, `T${tierMeta[tierOrder[index]].level}`]));
});

const range = computed({
  get: (): [number, number] => [lower.value, upper.value],
  set: (value: [number, number]) => { [lower.value, upper.value] = value; },
});
</script>

<template>
  <div class="tier-range" :class="{ dense }">
    <div class="head">
      <span>{{ t("tier.hardest") }} <strong>{{ displayTier(lower) }}</strong></span>
      <span class="dash" aria-hidden="true">—</span>
      <span>{{ t("tier.easiest") }} <strong>{{ displayTier(upper) }}</strong></span>
    </div>
    <NSlider
      v-model:value="range"
      range
      :min="0"
      :max="max"
      :step="1"
      :marks="marks"
      :format-tooltip="displayTier"
      :aria-label="t('tier.range')"
      class="slider"
      :style="{ '--tier-gradient': gradient, '--tier-fill': fillGradient }"
    />
  </div>
</template>

<style scoped>
.tier-range { display: grid; gap: var(--sp-3); }
.dense { gap: var(--sp-2); }

.head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--fg-subtle);
}
.head strong { color: var(--fg-default); font-weight: var(--fw-medium); }
.dash { color: var(--fg-disabled); }

/* 轨道就是色谱本身，压暗一档；选中段把同一条光谱按原色再铺一次 ——
   于是「选了哪一段难度」由鲜艳度说出来，而不是换成一种无关的颜色。

   两层都用 background-image：Naive 的主题色写在 background-color 上，
   图层盖在色层之上，不必去跟它的样式注入顺序抢优先级。 */
.slider { --n-rail-height: 10px; padding-bottom: var(--sp-5); }
.slider :deep(.n-slider-rail) {
  background-image: var(--tier-gradient);
  border-radius: var(--r-pill);
}
.slider :deep(.n-slider-rail__fill) {
  background-image: var(--tier-fill);
  border-radius: var(--r-pill);
}
.slider :deep(.n-slider-handle) { border: 2px solid var(--bg-page); }
.slider :deep(.n-slider-mark) {
  font-family: var(--font-num);
  font-size: var(--fs-micro);
  color: var(--fg-disabled);
}
.slider :deep(.n-slider-dots) { display: none; }
</style>
