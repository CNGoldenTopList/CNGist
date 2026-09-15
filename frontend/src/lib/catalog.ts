/**
 * 目录缓存。`/api/catalog` 一次拉全量，页面全部读这一份。
 *
 * React 版本里这份缓存是模块级可变状态，组件必须把 `catalogVersion` 手写进
 * 每个 useMemo 的依赖数组，漏一个就会把「目录还没到」那一刻的空结果永久缓存
 * 下来。Vue 的 shallowRef 自己就是依赖，computed 会跟着重算，那类 bug 在这里
 * 不存在——所以不要再往外暴露版本号让调用方手工挂依赖。
 */
import { computed, shallowRef } from "vue";
import type { CatalogData } from "@shared/catalog";
import { api } from "@/lib/api";

const EMPTY: CatalogData = {
  campaigns: [], maps: [], challenges: [], multiMapChallenges: [], players: [], submissions: [], suggestions: [],
  campaignHalls: [], campaignOrders: {}, challengeRelations: {}, campaignMenu: { fixed: [], favorites: [] },
};

const state = shallowRef<CatalogData | null>(null);
const loading = shallowRef(false);

/** 当前目录。未就绪时是空目录，页面照常渲染骨架。 */
export const catalog = computed(() => state.value ?? EMPTY);
/** 目录是否已就绪。 */
export const catalogReady = computed(() => state.value !== null);
export const catalogLoading = computed(() => loading.value);

let inflight: Promise<boolean> | null = null;

export function fetchCatalog(force = false): Promise<boolean> {
  if (inflight && !force) return inflight;
  loading.value = true;
  inflight = api.get<CatalogData>("/api/catalog").then(({ ok, data }) => {
    if (ok) state.value = data as unknown as CatalogData;
    loading.value = false;
    inflight = null;
    return ok;
  });
  return inflight;
}

/** 后台改完数据后重新拉目录，公开页立刻跟着变。 */
export const refreshCatalog = () => fetchCatalog(true);
