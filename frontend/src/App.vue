<script setup lang="ts">
/** 全站外壳：主题、顶栏、正文轨道。 */
import { onMounted } from "vue";
import { NConfigProvider, darkTheme, lightTheme, zhCN, dateZhCN, enUS, dateEnUS } from "naive-ui";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { naiveThemes } from "@/theme/naive";
import { useLanguage } from "@/i18n";
import { fetchCatalog } from "@/lib/catalog";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import { useOverlayViewport } from "@/lib/overlay-viewport";
import TopNav from "@/components/TopNav.vue";

const { locale } = useLanguage();
const session = useSessionStore();
// 显示设置要在首屏就把主题与 Tier 配色写到根元素上，否则会闪一次默认色。
const { theme } = storeToRefs(useDisplayStore());
useOverlayViewport();

const naiveLocale = computed(() => (locale.value === "en" ? enUS : zhCN));
const naiveDateLocale = computed(() => (locale.value === "en" ? dateEnUS : dateZhCN));

onMounted(() => {
  document.documentElement.lang = locale.value === "en" ? "en" : "zh-CN";
  // 目录是所有页面的数据底座，会话决定顶栏分叉；两者互不依赖，一起发。
  void fetchCatalog();
  void session.refresh();
});
</script>

<template>
  <NConfigProvider :theme="theme === 'light' ? lightTheme : darkTheme" :theme-overrides="naiveThemes[theme]" :locale="naiveLocale" :date-locale="naiveDateLocale" preflight-style-disabled>
    <TopNav />
    <main>
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
  </NConfigProvider>
</template>
