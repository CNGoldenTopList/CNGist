<script setup lang="ts">
/**
 * 顶栏。
 *
 * 形态语言的三处要点（改动请一起想清楚再动）：
 *   1. 没有容器描边与圆角卡片，分区靠地面色差 + 一条底部细线
 *   2. 导航项的选中态是一条与文字同宽的下划线，不是背景块
 *   3. 品牌区左侧一条暖金色脊，把「难度阶梯」这个主题带到页首
 *
 * 浮层（地图包菜单、账户菜单、抽屉、搜索、设置）全部交给 Naive UI：
 * 定位、焦点陷阱、Esc 关闭、滚动锁由组件保证，这里只管内容与形态。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { NDrawer, NDrawerContent, NDropdown, NPopover } from "naive-ui";
import { storeToRefs } from "pinia";
import { CAMPAIGN_MENU_FAVORITE_SLOTS } from "@shared/campaign-menu";
import type { Campaign } from "@shared/types";
import { catalog } from "@/lib/catalog";
import { useLanguage } from "@/i18n";
import { useSessionStore } from "@/stores/session";
import { useDisplayStore } from "@/stores/display";
import LocalizedName from "@/components/LocalizedName.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import GlobalSearchDialog from "@/components/GlobalSearchDialog.vue";
import DisplaySettingsDialog from "@/components/DisplaySettingsDialog.vue";

const { t } = useLanguage();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const display = useDisplayStore();
const { account, adminMode, isAdmin } = storeToRefs(session);
const { showCn, showEn } = storeToRefs(display);

const campaignOpen = ref(false);
const settingsOpen = ref(false);
const searchOpen = ref(false);
const drawerOpen = ref(false);

watch(() => route.fullPath, () => { drawerOpen.value = false; campaignOpen.value = false; });

const mainLinks = computed(() => [
  { to: "/", label: t("nav.home") },
  { to: "/golden", label: t("nav.golden") },
  { to: "/online", label: t("nav.online") },
  { to: "/maps", label: t("nav.maps") },
]);
const tailLinks = computed(() => [
  { to: "/feedback", label: t("nav.feedback") },
  { to: "/submit", label: t("nav.submit") },
]);

type CampaignMenuEntry = { campaign: Campaign; placeholder: boolean };

/** 用户收藏优先占据后六格，不足的格子再用管理员配置的默认收藏位补齐。 */
const campaignMenuItems = computed<CampaignMenuEntry[]>(() => {
  const available = catalog.value.campaigns;
  const menu = catalog.value.campaignMenu;
  const userFavorites = Array.from(new Set(account.value?.preferences?.favoriteCampaignIds || []))
    .filter((id) => !menu.fixed.includes(id) && available.some((campaign) => campaign.id === id))
    .slice(0, CAMPAIGN_MENU_FAVORITE_SLOTS);
  const fallback = menu.favorites.filter((id) => !menu.fixed.includes(id) && !userFavorites.includes(id));
  const entries = [
    ...menu.fixed.map((id) => ({ id, placeholder: false })),
    ...userFavorites.map((id) => ({ id, placeholder: false })),
    ...fallback.slice(0, CAMPAIGN_MENU_FAVORITE_SLOTS - userFavorites.length).map((id) => ({ id, placeholder: true })),
  ];
  return entries
    .map(({ id, placeholder }) => ({ campaign: available.find((campaign) => campaign.id === id), placeholder }))
    .filter((entry): entry is CampaignMenuEntry => Boolean(entry.campaign));
});

const nameLanguages = computed(() => [
  { value: "cn" as const, label: t("nav.cnButton"), title: t("nav.showCn"), on: showCn.value },
  { value: "en" as const, label: t("nav.enButton"), title: t("nav.showEn"), on: showEn.value },
]);

const accountOptions = computed(() => {
  if (!account.value) return [];
  const items: Array<{ key: string; label: string }> = [
    { key: account.value.claimedPlayerId ? `/player/${account.value.claimedPlayerId}` : "/claim", label: t("nav.profile") },
    { key: "/account", label: t("nav.account") },
  ];
  if (!account.value.claimedPlayerId) items.push({ key: "/claim", label: t("nav.claim") });
  if (isAdmin.value && adminMode.value) items.push({ key: "/admin", label: t("nav.adminPanel") });
  if (isAdmin.value) items.push({ key: "toggle-admin", label: adminMode.value ? t("nav.playerMode") : t("nav.adminMode") });
  items.push({ key: "logout", label: t("nav.logout") });
  return items;
});

function onAccountSelect(key: string) {
  if (key === "logout") { void session.logout().then(() => router.push("/")); return; }
  if (key === "toggle-admin") { session.setAdminMode(!adminMode.value); return; }
  void router.push(key);
}

const isActive = (path: string) => route.path === path;
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <button class="mobile-menu-button" type="button" :aria-label="t('nav.open')" :aria-expanded="drawerOpen" @click="drawerOpen = true">☰</button>

      <RouterLink class="site-logo" to="/" :aria-label="t('nav.homeLabel')">
        <span class="brand-text"><strong>{{ t("brand.name") }}</strong><small>{{ t("nav.tagline") }}</small></span>
      </RouterLink>

      <nav class="main-nav" :aria-label="t('nav.main')">
        <RouterLink v-for="link in mainLinks" :key="link.to" :to="link.to" class="nav-link" :class="{ active: isActive(link.to) }">
          {{ link.label }}
        </RouterLink>

        <NPopover
          v-model:show="campaignOpen"
          trigger="hover"
          placement="bottom-start"
          :show-arrow="false"
          :style="{ padding: '4px', minWidth: '240px' }"
        >
          <template #trigger>
            <button class="nav-link" type="button" :class="{ active: route.path.startsWith('/campaign/') }" aria-haspopup="true" :aria-expanded="campaignOpen">
              {{ t("common.campaigns") }}
              <span class="caret" :data-open="campaignOpen || undefined" aria-hidden="true" />
            </button>
          </template>
          <div class="campaign-menu">
            <RouterLink
              v-for="{ campaign, placeholder } in campaignMenuItems"
              :key="campaign.id"
              :to="`/campaign/${campaign.id}`"
              class="campaign-menu-item"
            >
              <LocalizedName :name="campaign.shortName" :cn-name="campaign.cnName" truncate />
              <small v-if="placeholder" class="campaign-favorite-slot">{{ t("nav.favoriteSlot") }}</small>
            </RouterLink>
          </div>
        </NPopover>

        <RouterLink v-for="link in tailLinks" :key="link.to" :to="link.to" class="nav-link" :class="{ active: isActive(link.to) }">
          {{ link.label }}
        </RouterLink>
        <RouterLink v-if="isAdmin && adminMode" to="/admin" class="nav-link" :class="{ active: isActive('/admin') }">{{ t("nav.admin") }}</RouterLink>
      </nav>

      <div class="header-account">
        <div class="name-mode-switch" role="group" :aria-label="t('nav.nameMode')">
          <button
            v-for="language in nameLanguages"
            :key="language.value"
            type="button"
            :class="{ active: language.on }"
            :aria-pressed="language.on"
            :title="language.title"
            @click="display.toggleNameLanguage(language.value)"
          >{{ language.label }}</button>
        </div>

        <button class="header-search" type="button" :aria-label="t('nav.globalSearch')" @click="searchOpen = true">
          <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" />
            <line x1="10.6" y1="10.6" x2="14" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span class="search-label">{{ t("nav.search") }}</span>
        </button>

        <button class="settings-button" type="button" :aria-label="t('nav.openSettings')" :title="t('nav.settings')" @click="settingsOpen = true">⚙</button>

        <NDropdown v-if="account" trigger="hover" placement="bottom-end" :options="accountOptions" @select="onAccountSelect">
          <button class="account-nav-button" type="button">
            <PlayerAvatar :player-id="account.claimedPlayerId" :name="account.displayName" />
            <span class="account-name">{{ account.displayName }}</span>
            <span class="caret" aria-hidden="true" />
          </button>
        </NDropdown>
        <RouterLink v-else class="login-link" to="/account">{{ t("nav.login") }}</RouterLink>
      </div>
    </div>

    <NDrawer v-model:show="drawerOpen" :width="320" placement="left">
      <NDrawerContent :title="t('brand.name')" closable body-content-style="padding: 8px 12px 16px">
        <nav class="drawer-nav" :aria-label="t('nav.mobile')">
          <RouterLink v-for="link in mainLinks" :key="link.to" :to="link.to" @click="drawerOpen = false">{{ link.label }}</RouterLink>
          <details>
            <summary>{{ t("common.campaigns") }}</summary>
            <div>
              <RouterLink v-for="{ campaign, placeholder } in campaignMenuItems" :key="campaign.id" :to="`/campaign/${campaign.id}`" @click="drawerOpen = false">
                <LocalizedName :name="campaign.shortName" :cn-name="campaign.cnName" truncate />
                <small v-if="placeholder" class="campaign-favorite-slot">{{ t("nav.favoriteSlot") }}</small>
              </RouterLink>
            </div>
          </details>
          <RouterLink v-for="link in tailLinks" :key="link.to" :to="link.to" @click="drawerOpen = false">{{ link.label }}</RouterLink>
          <RouterLink v-if="isAdmin && adminMode" to="/admin" @click="drawerOpen = false">{{ t("nav.admin") }}</RouterLink>
        </nav>
        <section class="drawer-account">
          <template v-if="account">
            <strong>{{ account.displayName }}</strong>
            <RouterLink :to="account.claimedPlayerId ? `/player/${account.claimedPlayerId}` : '/claim'" @click="drawerOpen = false">{{ t("nav.profile") }}</RouterLink>
            <RouterLink to="/account" @click="drawerOpen = false">{{ t("nav.account") }}</RouterLink>
            <RouterLink v-if="!account.claimedPlayerId" to="/claim" @click="drawerOpen = false">{{ t("nav.claim") }}</RouterLink>
            <button v-if="isAdmin" type="button" @click="session.setAdminMode(!adminMode)">{{ adminMode ? t("nav.playerMode") : t("nav.adminMode") }}</button>
            <button type="button" @click="session.logout()">{{ t("nav.logout") }}</button>
          </template>
          <RouterLink v-else to="/account" @click="drawerOpen = false">{{ t("nav.loginRegister") }}</RouterLink>
          <!-- 设置按钮在窄屏被藏掉了，抽屉里必须有入口 —— 而且这里用文字
               而不是齿轮图标，更容易找到。 -->
          <button type="button" @click="drawerOpen = false; settingsOpen = true">{{ t("settings.title") }}</button>
        </section>
      </NDrawerContent>
    </NDrawer>

    <GlobalSearchDialog v-model:show="searchOpen" />
    <DisplaySettingsDialog v-model:show="settingsOpen" />
  </header>
</template>

<style scoped>
.header {
  /* 页首右侧那一排控件（☰ / 中英 / 搜索 / 设置 / 登录）共用一条高度刻度。
     一处声明、一处覆盖，不要让任何控件再各写各的高度。 */
  --nav-ctl: var(--ctl-md);
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-header);
  border-bottom: var(--hairline);
}

/* 按整栏实际内容宽度居中，新增菜单项不会溢出固定宽度后偏向右侧。 */
.header-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  width: max-content;
  max-width: 100%;
  margin-inline: auto;
  min-height: 64px;
  padding-inline: var(--sp-5);
}

/* ── 品牌 ─────────────────────────────────────────────────── */
.site-logo {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex: 0 0 auto;
  min-width: 0;
  color: var(--fg-default);
  padding-left: var(--sp-3);
  /* 色脊：把主题带到页首。全站唯一允许的一处暖色。 */
  border-left: var(--rail-w) solid var(--brand-mark);
}
.site-logo:hover { color: var(--fg-default); }

.brand-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.brand-text strong {
  font-family: var(--font-title);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  letter-spacing: -.01em;
  line-height: 1;
  white-space: nowrap;
}
.brand-text small {
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  line-height: 1;
  white-space: nowrap;
}

/* ── 主导航 ───────────────────────────────────────────────── */
.main-nav { display: flex; align-items: center; gap: var(--sp-1); flex: 0 0 auto; }

.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  height: 64px;
  padding: 0 var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  flex: 0 0 auto;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease);
}
.nav-link:hover { color: var(--fg-default); }

/* 选中态是一条与文字同宽的下划线，不是背景块 —— 更安静，也更精确。 */
.nav-link.active { color: var(--fg-default); }
.nav-link.active::after {
  content: "";
  position: absolute;
  left: var(--sp-3);
  right: var(--sp-3);
  bottom: 0;
  height: 2px;
  background: var(--link);
  animation: nav-underline var(--dur-base) var(--ease);
}
@keyframes nav-underline { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.nav-link:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -4px; }

/* 直角箭头：两条边框旋转 45°。原来是一个 ⌄ 字符，字形与基线随字体变化，
   在一条 64px 高的导航里永远对不齐。 */
.caret {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  margin-left: 2px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  /* 旋转后视觉重心偏下，上移两像素才与文字的中线齐平 */
  transform: translateY(-2px) rotate(45deg);
  transition: transform var(--dur-fast) var(--ease);
}
.caret[data-open] { transform: translateY(1px) rotate(-135deg); }

/* ── 地图包菜单 ───────────────────────────────────────────── */
/* 项与项之间必须留出间距：菜单项内部的中英文是上下两行，
   若项间距为 0，中文名看起来就像下一项的一部分。 */
.campaign-menu { display: grid; gap: 2px; }
.campaign-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-height: 34px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  color: var(--fg-secondary);
  font-size: var(--fs-body);
  --cn-size: .78em;
}
/* 名字吃掉剩余宽度并允许收缩 —— 没有 min-width:0，flex 子项的最小尺寸
   等于内容宽度，省略号就永远不会触发，长名字会被挤成两行。 */
.campaign-menu-item > :first-child { flex: 1 1 auto; min-width: 0; }
.campaign-menu-item:hover { background: var(--bg-overlay); color: var(--fg-default); }

/* 收藏位标记贴右，且绝不收缩 —— 否则「收藏位」三个字会竖着排成三行。 */
.campaign-favorite-slot {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--fg-disabled);
  white-space: nowrap;
}
/* 空心星＝这是个空着的收藏位 */
.campaign-favorite-slot::before { content: "☆"; font-size: 1.1em; line-height: 1; }

/* ── 右侧账户区 ───────────────────────────────────────────── */
.header-account {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 0 0 auto;
  /* 窄屏下 .main-nav 是 display:none，没有 flex:1 的元素把这一组推到右边。 */
  margin-left: auto;
}

/* 中 / 英 两个开关。不是三选一的分段控件，而是可以同时亮起的两个独立状态 ——
   中间不留缝、各自只在外侧倒圆角：两个都亮时接成一个完整胶囊，
   「中英模式」这件事由形状说出来，不必再放一个写着「中英」的按钮。 */
.name-mode-switch {
  display: inline-flex;
  padding: 2px;
  border: var(--hairline);
  border-radius: var(--r-pill);
}
.name-mode-switch button {
  min-width: 32px;
  /* 外框有 2px 内边距与 1px 描边，上下各 3px；减掉才能与邻居等高 */
  height: calc(var(--nav-ctl) - 6px);
  padding: 0 var(--sp-2);
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-subtle);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.name-mode-switch button:first-child { border-radius: var(--r-pill) 0 0 var(--r-pill); padding-left: var(--sp-3); }
.name-mode-switch button:last-child { border-radius: 0 var(--r-pill) var(--r-pill) 0; padding-right: var(--sp-3); }
.name-mode-switch button:hover { color: var(--fg-default); }
.name-mode-switch button.active { color: var(--link); border-color: var(--link); }
/* 两个都亮时抹掉中缝，两段高亮合成一条连续的胶囊。 */
.name-mode-switch button.active:has(+ button.active) { border-right-color: transparent; }
.name-mode-switch button.active + button.active { border-left-color: transparent; }
.name-mode-switch button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--r-pill); }

.header-search,
.settings-button {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--nav-ctl);
  padding: 0 var(--sp-3);
  border: var(--hairline);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-subtle);
  font: inherit;
  font-size: var(--fs-body);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.settings-button { width: var(--nav-ctl); padding: 0; justify-content: center; }
/* 放大镜用内联 SVG：stroke 是矢量，任何 DPI 下都清晰。 */
.search-icon { flex: 0 0 auto; width: 15px; height: 15px; }

.header-search:hover,
.settings-button:hover { color: var(--fg-default); border-color: var(--border-strong); }
.header-search:focus-visible,
.settings-button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.account-nav-button {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--nav-ctl);
  padding: 0 var(--sp-2) 0 var(--sp-1);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-secondary);
  font: inherit;
  font-size: var(--fs-body);
  cursor: pointer;
}
.account-nav-button .account-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-nav-button:hover { color: var(--fg-default); }

.login-link {
  display: inline-flex;
  align-items: center;
  height: var(--nav-ctl);
  padding: 0 var(--sp-4);
  border-radius: var(--r-sm);
  background: var(--accent-600);
  color: var(--fg-onAccent);
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
}
.login-link:hover { background: var(--accent-500); color: var(--fg-onAccent); }

/* ── 移动端 ───────────────────────────────────────────────── */
/* 外观只写一次；下面的断点只负责决定它出不出现。 */
.mobile-menu-button {
  display: none;
  place-items: center;
  flex: 0 0 auto;
  width: var(--nav-ctl);
  height: var(--nav-ctl);
  padding: 0;
  border: var(--hairline);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--fs-h3);
  cursor: pointer;
}
.mobile-menu-button:hover { color: var(--fg-default); border-color: var(--border-strong); }
.mobile-menu-button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.drawer-nav { display: grid; padding: var(--sp-2) 0; }
.drawer-nav > a,
.drawer-nav summary,
.drawer-nav details a,
.drawer-account > a,
.drawer-account > button {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 0 var(--sp-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-secondary);
  font: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  text-align: left;
  cursor: pointer;
}
.drawer-nav > a:hover,
.drawer-nav summary:hover,
.drawer-nav details a:hover,
.drawer-account > a:hover,
.drawer-account > button:hover { background: var(--bg-overlay); color: var(--fg-default); }
.drawer-nav details { border-block: var(--hairline); }
.drawer-nav details > div { display: grid; padding-left: var(--sp-3); }
/* 抽屉里的地图包项与桌面菜单同构：名字可截断，收藏位贴右。 */
.drawer-nav details a {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding-block: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.drawer-nav details a > :first-child { flex: 1 1 auto; min-width: 0; }

.drawer-account {
  display: grid;
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: var(--hairline);
}
.drawer-account > strong {
  padding: var(--sp-2) var(--sp-3);
  font-family: var(--font-title);
  color: var(--fg-default);
}

/* 中等宽度收紧间距；放不下完整导航时使用抽屉。 */
@media (max-width: 900px) {
  .header-inner { gap: var(--sp-4); padding-inline: var(--sp-4); }
  .nav-link { padding: 0 var(--sp-2); }
  .brand-text small { display: none; }
}

@media (max-width: 1200px) {
  .header-inner { width: 100%; }
  .main-nav { display: none; }
  .mobile-menu-button { display: grid; }
}

@media (max-width: 640px) {
  .header-inner { gap: var(--sp-3); min-height: 56px; padding-inline: var(--sp-4); }
  .main-nav,
  .settings-button { display: none; }
  .account-nav-button .account-name { display: none; }
  .nav-link { height: 56px; }
  .brand-text small { display: none; }
  /* 手机上整排一起抬到 --ctl-lg：这里要的是更大的目标，不是更小的。
     一处改高度，☰ / 中英 / 搜索 同时跟上，不会再有谁掉队。 */
  .header-inner { --nav-ctl: var(--ctl-lg); }
  .header-search { padding-inline: var(--sp-3); color: var(--fg-muted); flex: 0 0 auto; }
  .name-mode-switch button { padding-inline: var(--sp-2); }
  .mobile-menu-button { display: grid; }
  .site-logo { padding-left: var(--sp-2); }
  .header-account { gap: var(--sp-1); }
}

/* 英文导航更长，换抽屉的断点要提前。 */
:global(html[lang="en"]) .brand-text small { letter-spacing: .02em; }
@media (min-width: 1201px) and (max-width: 1400px) {
  :global(html[lang="en"]) .header-inner { width: 100%; }
  :global(html[lang="en"]) .main-nav { display: none; }
  :global(html[lang="en"]) .mobile-menu-button { display: grid; }
}
@media (max-width: 380px) {
  :global(html[lang="en"]) .search-label { display: none; }
}
</style>
