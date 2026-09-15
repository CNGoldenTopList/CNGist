<script setup lang="ts">
/** 加入 / 移出愿望单。未登录时不出现 —— 愿望单本来就是本人的东西。 */
import { computed, ref, watch } from "vue";
import { NButton } from "naive-ui";
import { storeToRefs } from "pinia";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import { addWish, hasWish, refreshWishlist, removeWishByChallenge, wishlistEntries, wishlistLoaded } from "@/lib/wishlist";
import LinkButton from "@/components/LinkButton.vue";

const props = defineProps<{ challengeId: number }>();

const { t } = useLanguage();
const { account } = storeToRefs(useSessionStore());
const busy = ref(false);

watch(account, (value) => { if (value && !wishlistLoaded.value) void refreshWishlist(); }, { immediate: true });

const added = computed(() => Boolean(wishlistEntries.value.length >= 0) && hasWish(props.challengeId));

async function toggle() {
  if (busy.value) return;
  busy.value = true;
  await (added.value ? removeWishByChallenge(props.challengeId) : addWish(props.challengeId));
  busy.value = false;
}
</script>

<template>
  <div v-if="account" class="quick-action">
    <NButton size="small" :type="added ? 'default' : 'primary'" :loading="busy" @click="toggle">
      {{ added ? t("wishlist.added") : t("wishlist.add") }}
    </NButton>
    <LinkButton v-if="added" to="/wishlist" size="small" quaternary>{{ t("player.editWishlist") }}</LinkButton>
  </div>
</template>

<style scoped>
.quick-action { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; flex: 0 0 auto; }
</style>
