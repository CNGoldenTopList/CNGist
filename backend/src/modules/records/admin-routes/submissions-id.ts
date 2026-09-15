import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { isAdminRole } from "../../../../../shared/src/account-roles";
import { currentAccount } from "../../auth/session";
import { getRuntimeSubmission, updateSubmission } from "../submission-service";

/** 单条记录的后台视图。审核队列（/api/admin/submissions）只装站内提交与未通过的 */
export async function GET(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || !isAdminRole(owner.role) || owner.status !== "active") return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const id = pathEntityId(request.params.id);
  const record = await getRuntimeSubmission(id);
  if (!record) return jsonResponse({ ok: false, error: "记录不存在或已删除。" }, { status: 404 });
  return jsonResponse({ ok: true, record });
}

export async function PATCH(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || !isAdminRole(owner.role) || owner.status !== "active") return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ ok: false, error: "请求格式有误。" }, { status: 400 });
  const id = pathEntityId(request.params.id);
  const result = await updateSubmission({ id: owner.id, displayName: owner.displayName }, id, body);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status });
  return jsonResponse({ ok: true, record: result.data });
}
