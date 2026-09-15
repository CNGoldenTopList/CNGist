import { requestUrl, type ApiRequest } from "../../../plugins/http";
import { adminRead } from "../../auth/admin-route";
import { loadAuditPage } from "../admin-service";

/** 审计日志，按页取。日期区间与类型过滤都在 SQL 里做 —— 旧实现是把整张表 */
export async function GET(request: ApiRequest) {
  const params = requestUrl(request).searchParams;
  const number = (name: string) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) ? value : undefined;
  };
  return adminRead(() => loadAuditPage({
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    type: params.get("type") || undefined,
    limit: number("limit"),
    offset: number("offset"),
  }));
}
