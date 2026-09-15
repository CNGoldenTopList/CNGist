/**
 * 会话。身份由 HttpOnly 的 `cngist_session` Cookie 承载，这里只做取数与转发；
 * 客户端不保存也拿不到任何凭据，`accountId` 一类的字段永远由服务端说了算。
 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/lib/api";
import { useLanguage, type ApiReply } from "@/i18n";
import { isAdminRole, type AccountRole } from "@shared/account-roles";
import type { AccountPreferences } from "@shared/account-preferences";

export type SessionAccount = {
  id: number;
  displayName: string;
  email: string;
  emailVerified: boolean;
  claimedPlayerId?: number;
  claimedBilibiliName?: string;
  bilibiliUid?: string;
  qqLinked: boolean;
  role: AccountRole;
  preferences?: AccountPreferences;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export const useSessionStore = defineStore("session", () => {
  const { apiError } = useLanguage();
  const account = ref<SessionAccount | null>(null);
  const ready = ref(false);
  /** 管理员视图的本地开关。为 null 时取账户偏好里的值。 */
  const adminOverride = ref<boolean | null>(null);

  const isAdmin = computed(() => isAdminRole(account.value?.role));
  const adminMode = computed(() => isAdmin.value && (adminOverride.value ?? account.value?.preferences?.adminMode ?? true));

  async function refresh() {
    const { data } = await api.get<{ account?: SessionAccount | null }>("/api/auth/session");
    account.value = data.account ?? null;
    ready.value = true;
  }

  /** 把接口返回的账户写回本地；失败时把错误按当前语言交给调用方。 */
  function apply(result: { ok: boolean; status: number; data: ApiReply & { account?: SessionAccount } }): ActionResult {
    if (result.ok) {
      if (result.data.account) account.value = result.data.account;
      return { ok: true };
    }
    return { ok: false, error: apiError(result.data) };
  }

  function updatePreferences(patch: Partial<AccountPreferences>) {
    if (!account.value) return;
    // 先落本地，界面立刻响应；写库失败时下次 refresh 会纠回来。
    account.value = { ...account.value, preferences: { ...account.value.preferences, ...patch } };
    void api.patch("/api/auth/preferences", patch);
  }

  function setAdminMode(next: boolean) {
    if (!isAdmin.value) { adminOverride.value = false; return; }
    adminOverride.value = next;
    updatePreferences({ adminMode: next });
  }

  const registerWithEmail = async (email: string, password: string, displayName: string) =>
    apply(await api.post("/api/auth/register", { email, password, displayName }));

  const loginWithEmail = async (email: string, password: string) =>
    apply(await api.post("/api/auth/login", { email, password }));

  async function logout() {
    account.value = null;
    adminOverride.value = null;
    await api.post("/api/auth/logout");
  }

  const updateAccount = async (patch: { displayName?: string; email?: string }) =>
    apply(await api.patch("/api/auth/account", patch));

  const changePassword = async (currentPassword: string, nextPassword: string) =>
    apply(await api.post("/api/auth/password", { currentPassword, nextPassword }));

  return {
    account, ready, isAdmin, adminMode,
    refresh, setAdminMode, updatePreferences, updateAccount, changePassword,
    registerWithEmail, loginWithEmail, logout,
  };
});
