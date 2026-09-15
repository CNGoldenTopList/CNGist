import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { isAdminRole } from "../../../../../shared/src/account-roles";
import { currentAccount } from "../../auth/session";
import { db } from "../../../db/client";
import { adminTask } from "../../../db/schema/index";
import { adminRead } from "../../auth/admin-route";
import { loadTaskBoard } from "../admin-service";

/** 待办与待处理反馈。 */
export async function GET() {
  return adminRead(loadTaskBoard);
}

export async function POST(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || !isAdminRole(owner.role) || owner.status !== "active") {
    return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  }
  const body = await Promise.resolve(request.body).catch(() => null) as {
    id?: unknown; type?: unknown; title?: unknown; detail?: unknown;
  } | null;
  const type = typeof body?.type === "string" ? body.type.trim().slice(0, 200) : "";
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 500) : "";
  const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 10_000) : "";
  if (!type || !title) return jsonResponse({ ok: false, error: "待办格式无效。" }, { status: 400 });
  await db.insert(adminTask).values({ type, title, detail }).onConflictDoNothing();
  return jsonResponse({ ok: true });
}
