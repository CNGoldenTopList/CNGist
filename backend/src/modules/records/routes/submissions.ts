import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { createPlayerSubmission, listOwnOpenSubmissions } from "../submission-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 本人的审核中与已拒绝提交，供个人页渲染。身份只认会话认领的玩家。 */
export async function GET() {
  const owner = await currentAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  if (!owner.claimedPlayerId) return jsonResponse(fail("claimRequired"), { status: 403 });
  return jsonResponse({ ok: true, records: await listOwnOpenSubmissions(owner.claimedPlayerId) });
}

export async function POST(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  if (!owner.claimedPlayerId) return jsonResponse(fail("claimRequired"), { status: 403 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await createPlayerSubmission({ id: owner.id, displayName: owner.displayName }, owner.claimedPlayerId, body);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, record: result.data }, { status: 201 });
}
