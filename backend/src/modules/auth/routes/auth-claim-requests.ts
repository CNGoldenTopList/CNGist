import { jsonResponse } from "../../../plugins/http";
import { currentSession } from "../session";
import { myPlayerClaimRequest, toClaimRequestPayload } from "../player-claims";
import { fail } from "../../../../../shared/src/api-errors";

export async function GET() {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });
  const request = await myPlayerClaimRequest(active.accountId);
  return jsonResponse({ ok: true, request: request ? toClaimRequestPayload(request) : null });
}

/** 旧客户端必须升级到绑定码流程，不能再生成未验证的审核申请。 */
export async function POST() {
  return jsonResponse(fail("bindingRequired"), { status: 410 });
}
