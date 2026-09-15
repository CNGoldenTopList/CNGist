import { headerValue, type ApiRequest } from "../../plugins/http";
/** 从请求里取会话元信息。X-Forwarded-For 需要反代转发，否则 ip 会是空的。 */
export function requestMeta(request: ApiRequest) {
  return {
    userAgent: headerValue(request, "user-agent") ?? undefined,
    ip: request.ip,
  };
}
