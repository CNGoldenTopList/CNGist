import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { isAdminRole } from "../../../../../shared/src/account-roles";
import { currentAccount } from "../../auth/session";
import { createAdminSubmission } from "../submission-service";
import { adminRead } from "../../auth/admin-route";
import { loadReviewQueue } from "../../admin/admin-service";

/** 审核队列。只有这一个域，不再附带回收站、审计与待办。 */
export async function GET() {
  return adminRead(loadReviewQueue);
}

async function adminAccount() {
  const owner = await currentAccount();
  return owner && isAdminRole(owner.role) && owner.status === "active" ? owner : null;
}

export async function POST(request: ApiRequest) {
  const owner = await adminAccount();
  if (!owner) return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ ok: false, error: "请求格式有误。" }, { status: 400 });
  const result = await createAdminSubmission({ id: owner.id, displayName: owner.displayName }, body);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status });
  return jsonResponse({ ok: true, record: result.data }, { status: 201 });
}
