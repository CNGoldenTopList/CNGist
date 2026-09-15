import { type ApiRequest } from "../../../plugins/http";
import { CCT_LIMITS } from "../cct-state";
import { withDevice } from "../device-route";

/** 设备启动时读一次：确认凭证还有效，并拿到服务端当前的限额。 */
async function config(request: ApiRequest) {
  return withDevice(request, async (principal) => ({
    deviceId: principal.externalId,
    limits: {
      attemptsPerRoom: CCT_LIMITS.attempts,
      roomsPerScope: CCT_LIMITS.rooms,
      scopeBytes: CCT_LIMITS.scopeBytes,
      scopesPerAccount: CCT_LIMITS.scopesPerAccount,
    },
  }));
}

// 读取用 GET 更自然；保留 POST 是因为有些 HTTP 客户端对带 Authorization 的 GET 处理各异。
export const GET = config;
export const POST = config;
