import { jsonResponse, type ApiRequest } from "../../plugins/http";
/** 后台命令路由的统一外壳：鉴权、请求体校验与错误码都只写一次。 */
import { currentAccount } from "./session";
import type { Admin, Result } from "../admin/admin-commands";
import { isAdminRole, isSuperAdminRole } from "../../../../shared/src/account-roles";

export async function requireAdmin(superOnly = false): Promise<Admin | null> {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active" || !isAdminRole(owner.role)) return null;
  if (superOnly && !isSuperAdminRole(owner.role)) return null;
  return { id: owner.id, displayName: owner.displayName, role: owner.role };
}

/** 后台读取路由的统一外壳：鉴权与错误码同样只写一次。 */
export async function adminRead<T>(load: () => Promise<T>, superOnly = false) {
  const admin = await requireAdmin(superOnly);
  if (!admin) return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  try {
    return jsonResponse({ ok: true, data: await load() });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return jsonResponse({ ok: false, error: (error as Error).message }, { status });
    console.error("[admin-read]", error);
    return jsonResponse({ ok: false, error: "读取失败，请稍后重试。" }, { status: 500 });
  }
}

type Body = Record<string, unknown>;

export async function adminCommand(request: ApiRequest, run: (admin: Admin, body: Body) => Promise<Result<unknown>>, superOnly = false) {
  const admin = await requireAdmin(superOnly);
  if (!admin) return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const parsed = await Promise.resolve(request.body).catch(() => undefined);
  if (parsed !== undefined && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
    return jsonResponse({ ok: false, error: "请求格式有误。" }, { status: 400 });
  }
  try {
    const result = await run(admin, (parsed ?? {}) as Body);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status });
    return jsonResponse({ ok: true, data: result.data ?? null });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return jsonResponse({ ok: false, error: (error as Error).message }, { status });
    console.error("[admin-command]", error);
    return jsonResponse({ ok: false, error: "操作失败，请稍后重试。" }, { status: 500 });
  }
}
