/**
 * 本人愿望单。地图页的「加入愿望单」按钮与 /wishlist 管理页读的是同一份，
 * 任何一处改动都要让另一处立刻跟上，所以状态放在模块级而不是各自 fetch。
 */
import { computed, shallowRef } from "vue";
import { api } from "@/lib/api";

/** 与 `/api/wishlist` 的响应一一对应，字段名不要在前端另起一套。 */
export type WishlistStatus = "active" | "soon" | "later" | "archive";
export type WishlistEntry = {
  id: number;
  playerId: number;
  challengeId: number;
  status: WishlistStatus;
  progress: number;
  bestDeaths?: number | null;
  comment?: string;
  practiceDuration?: string;
  createdAt?: string;
  updatedAt?: string;
};

const entries = shallowRef<WishlistEntry[]>([]);
const loaded = shallowRef(false);

export const wishlistEntries = computed(() => entries.value);
export const wishlistLoaded = computed(() => loaded.value);
export const hasWish = (challengeId: number) => entries.value.some((entry) => entry.challengeId === challengeId);

/** 别人的愿望单是公开的，按玩家读；这份不进本人的缓存。 */
export async function fetchPlayerWishlist(playerId: number) {
  const { ok, data } = await api.get<{ entries?: WishlistEntry[] }>(`/api/wishlist?playerId=${playerId}`);
  return ok ? data.entries ?? [] : [];
}

export async function refreshWishlist() {
  const { ok, data } = await api.get<{ entries?: WishlistEntry[] }>("/api/wishlist");
  if (ok) {
    entries.value = data.entries ?? [];
    loaded.value = true;
  }
  return ok;
}

export async function addWish(challengeId: number) {
  const result = await api.post("/api/wishlist", { challengeId });
  if (result.ok) await refreshWishlist();
  return result;
}

export async function removeWishByChallenge(challengeId: number) {
  const result = await api.delete(`/api/wishlist?challengeId=${challengeId}`);
  if (result.ok) await refreshWishlist();
  return result;
}

export async function removeWish(id: number) {
  const result = await api.delete(`/api/wishlist?id=${id}`);
  if (result.ok) await refreshWishlist();
  return result;
}

export async function patchWish(id: number, patch: Partial<WishlistEntry>) {
  const result = await api.patch("/api/wishlist", { id, ...patch });
  if (result.ok) await refreshWishlist();
  return result;
}

/** 登出时清空，免得下一个访客看到上一个人的愿望单。 */
export function clearWishlist() {
  entries.value = [];
  loaded.value = false;
}
