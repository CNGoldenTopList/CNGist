import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { loadMapStats } from "../tracker-stats-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 本人已上传的统计，按目录地图取。只服务登录本人 —— */
export async function GET(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const mapIds = requestUrl(request).searchParams.getAll("mapId").slice(0, 200).map(pathEntityId);
  return jsonResponse({ ok: true, stats: await loadMapStats(owner.id, mapIds) });
}
