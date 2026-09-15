import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { redeemAuthorization } from "../tracker-device-service";
import { fail } from "../../../../../shared/src/api-errors";

/** mod 用授权码兑换设备凭证。不需要网站会话 —— 授权码本身就是凭据， */
export async function POST(request: ApiRequest) {
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await redeemAuthorization(body as Record<string, unknown>);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, ...result.data });
}
