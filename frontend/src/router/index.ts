/**
 * 路由表。页面全部按需加载：目录页、地图页和后台各成一块，
 * 首屏只下载首页需要的那部分。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: () => import("@/pages/HomePage.vue") },
  { path: "/golden", name: "golden", component: () => import("@/pages/GoldenPage.vue") },
  { path: "/personal-golden", name: "personal-golden", component: () => import("@/pages/PersonalGoldenPage.vue") },
  { path: "/farewell-golden", name: "farewell-golden", component: () => import("@/pages/FarewellGoldenPage.vue") },
  { path: "/online", name: "online", component: () => import("@/pages/OnlinePage.vue") },
  { path: "/maps", name: "maps", component: () => import("@/pages/MapsPage.vue") },
  { path: "/search", name: "search", component: () => import("@/pages/SearchPage.vue") },
  { path: "/campaign/:id", name: "campaign", component: () => import("@/pages/CampaignPage.vue"), props: true },
  { path: "/map/:id", name: "map", component: () => import("@/pages/MapPage.vue"), props: true },
  { path: "/multi-challenge/:id", name: "multi-challenge", component: () => import("@/pages/MultiChallengePage.vue"), props: true },
  /* 挑战视图并在地图页里；这条路由只为已经分享出去的旧地址做重定向。 */
  { path: "/challenge/:id", name: "challenge", component: () => import("@/pages/ChallengeRedirectPage.vue"), props: true },
  { path: "/player/:id", name: "player", component: () => import("@/pages/PlayerPage.vue"), props: true },
  { path: "/record/:id", name: "record", component: () => import("@/pages/RecordPage.vue"), props: true },
  { path: "/submit", name: "submit", component: () => import("@/pages/SubmitPage.vue") },
  { path: "/wishlist", name: "wishlist", component: () => import("@/pages/WishlistPage.vue") },
  { path: "/account", name: "account", component: () => import("@/pages/AccountPage.vue") },
  { path: "/claim", name: "claim", component: () => import("@/pages/ClaimPage.vue") },
  { path: "/reset-password", name: "reset-password", component: () => import("@/pages/ResetPasswordPage.vue") },
  { path: "/feedback", name: "feedback", component: () => import("@/pages/FeedbackPage.vue") },
  { path: "/report", name: "report", component: () => import("@/pages/ReportPage.vue") },
  { path: "/qa", name: "qa", component: () => import("@/pages/QaPage.vue") },
  { path: "/api", name: "api", component: () => import("@/pages/ApiPage.vue") },
  { path: "/tracker/install", name: "tracker-install", component: () => import("@/pages/TrackerInstallPage.vue") },
  { path: "/tracker/activate", name: "tracker-activate", component: () => import("@/pages/TrackerActivatePage.vue") },
  { path: "/admin", name: "admin", component: () => import("@/pages/admin/AdminPage.vue") },
  { path: "/admin/create/:kind", name: "admin-create", component: () => import("@/pages/admin/AdminCreatePage.vue"), props: true },
  { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("@/pages/NotFoundPage.vue") },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  /* 同一页内换选中的挑战只改查询串，不该把人弹回顶部。 */
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});
