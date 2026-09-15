import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { appOrigin } from "../../auth/providers";
import { approveAuthorization, parseAuthorizeRequest } from "../tracker-device-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 玩家确认一台设备。这是整条链上唯一签发凭证的地方，因此除了会话之外 */
export async function POST(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });

  const origin = headerValue(request, "origin");
  if (origin && origin !== appOrigin()) return jsonResponse(fail("badOrigin"), { status: 403 });

  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });

  // 参数在展示确认页之前已经校验过一次，这里再校验一次：页面可能被改，接口不能信它。
  const parsed = parseAuthorizeRequest(body as Record<string, unknown>);
  if (!parsed) return jsonResponse(fail("deviceRequestInvalid"), { status: 400 });

  const result = await approveAuthorization(owner.id, parsed);
  return jsonResponse({ ok: true, ...result }, { status: 201 });
}
