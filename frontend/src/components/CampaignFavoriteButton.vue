<script setup lang="ts">
/**
 * 地图包收藏 —— 顶栏只有六个用户收藏位，满了就说满了。
 * 状态由按钮变体表达，不用 ☆ / ★ 字符：字形随系统字体变，对不齐。
 */
import { computed } from "vue";
import { NButton } from "naive-ui";
import { storeToRefs } from "pinia";
import { CAMPAIGN_MENU_FAVORITE_SLOTS } from "@shared/campaign-menu";
import { catalog } from "@/lib/catalog";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import LinkButton from "@/components/LinkButton.vue";

const props = defineProps<{ campaignId: number }>();

const { t } = useLanguage();
const session = useSessionStore();
const { account } = storeToRefs(session);

const favorites = computed(() => account.value?.preferences?.favoriteCampaignIds || []);
/** 固定位由目录带过来，公开页不需要碰后台状态。 */
const isFixed = computed(() => catalog.value.campaignMenu.fixed.includes(props.campaignId));
const isFavorite = computed(() => favorites.value.includes(props.campaignId));
const full = computed(() => !isFavorite.value && favorites.value.length >= CAMPAIGN_MENU_FAVORITE_SLOTS);

function toggle() {
  if (isFavorite.value) {
    session.updatePreferences({ favoriteCampaignIds: favorites.value.filter((id) => id !== props.campaignId) });
    return;
  }
  if (full.value) return;
  session.updatePreferences({ favoriteCampaignIds: [...favorites.value, props.campaignId] });
}
</script>

<template>
  <LinkButton v-if="!account" to="/account" quaternary>{{ t("entity.favoriteLogin") }}</LinkButton>
  <NButton v-else-if="isFixed" disabled>{{ t("entity.favoritePinned") }}</NButton>
  <NButton
    v-else
    :type="isFavorite ? 'primary' : 'default'"
    :disabled="full"
    :title="full ? t('entity.favoriteFullHint', { count: CAMPAIGN_MENU_FAVORITE_SLOTS }) : undefined"
    @click="toggle"
  >
    {{ isFavorite ? t("entity.favoriteAdded") : full ? t("entity.favoriteFull") : t("entity.favoriteAdd") }}
  </NButton>
</template>
