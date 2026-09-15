import { jsonResponse, headerValue, type ApiRequest } from "../../plugins/http";
/** 设备上传路由的统一外壳：鉴权、请求体上限、错误码映射只写一次。 */
import { CctError } from "./cct-state";
import { httpStatusForCct } from "./cct-http";
import { bearerToken } from "./device-auth";
import { authenticateDevice, touchDevice, type DevicePrincipal } from "./tracker-device-service";

/** 单个作用域上限 8 MiB，留一点 JSON 结构的余量；再大直接拒，不读进内存。 */
const MAX_BODY_BYTES = 9 * 1024 * 1024;

const errorBody = (code: string) => ({ ok: false as const, error: code, code });

export type DeviceHandler<T> = (principal: DevicePrincipal, body: Record<string, unknown>) => Promise<T>;

export async function withDevice<T>(request: ApiRequest, handle: DeviceHandler<T>, maxBytes = MAX_BODY_BYTES) {
  const principal = await authenticateDevice(bearerToken(headerValue(request, "authorization")));
  // 撤销、关闭保存、token 不认识，对客户端都是同一个回答：这个凭证现在不能用。
  if (!principal) return jsonResponse(errorBody("device_unauthorized"), { status: 401 });

  const body = request.body ?? {};
  if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) return jsonResponse(errorBody("scope_too_large"), { status: 413 });
  if (body === null || typeof body !== "object" || Array.isArray(body)) return jsonResponse(errorBody("invalid_body"), { status: 400 });

  try {
    const data = await handle(principal, body as Record<string, unknown>);
    // 记录活跃时间失败不该让一次成功的上传变成错误。
    void touchDevice(principal.deviceId).catch(() => {});
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    if (error instanceof CctError) {
      return jsonResponse(errorBody(error.code), { status: httpStatusForCct(error.code) });
    }
    console.error("[tracker-upload]", error);
    return jsonResponse(errorBody("server_error"), { status: 500 });
  }
}
