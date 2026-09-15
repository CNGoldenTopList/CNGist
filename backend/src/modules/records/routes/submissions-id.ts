import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { resubmitOwnSubmission, withdrawOwnSubmission } from "../submission-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 玩家自己改这条提交并重新送审。归属由服务端按会话认领的玩家判定。 */
export async function PATCH(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInActive"), { status: 401 });
  if (!owner.claimedPlayerId) return jsonResponse(fail("claimRequired"), { status: 403 });
  const id = pathEntityId(request.params.id);
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await resubmitOwnSubmission({ id: owner.id, displayName: owner.displayName }, owner.claimedPlayerId, id, body);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, record: result.data });
}

/** 撤回：任何状态都能撤，撤回后这条记录进回收站。 */
export async function DELETE(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInActive"), { status: 401 });
  if (!owner.claimedPlayerId) return jsonResponse(fail("claimRequired"), { status: 403 });
  const id = pathEntityId(request.params.id);
  const result = await withdrawOwnSubmission({ id: owner.id, displayName: owner.displayName }, owner.claimedPlayerId, id);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true });
}
