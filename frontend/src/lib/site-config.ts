/**
 * 站点功能配置。`/api/config` 说明这套部署开了哪些登录方式、发不发信，
 * 前端因此不硬编码任何 provider —— 凭据没配齐的环境不会渲染出点了就 503 的入口。
 */
import { computed, shallowRef } from "vue";
import { api } from "@/lib/api";

export type AuthProvider = { id: string; kind: "password" | "oidc"; label: string; name: string; startPath?: string };
export type SiteConfig = { providers: AuthProvider[]; mailAvailable: boolean; bindingArticleUrl?: string; icpNumber?: string };

const EMPTY: SiteConfig = { providers: [], mailAvailable: false };
const state = shallowRef<SiteConfig | null>(null);
let inflight: Promise<SiteConfig> | null = null;

export const siteConfig = computed(() => state.value ?? EMPTY);
export const siteConfigReady = computed(() => state.value !== null);

export function fetchSiteConfig(): Promise<SiteConfig> {
  if (inflight) return inflight;
  inflight = api.get<SiteConfig>("/api/config").then(({ ok, data }) => {
    if (ok) state.value = { providers: data.providers ?? [], mailAvailable: Boolean(data.mailAvailable), bindingArticleUrl: data.bindingArticleUrl, icpNumber: data.icpNumber };
    inflight = null;
    return state.value ?? EMPTY;
  });
  return inflight;
}
