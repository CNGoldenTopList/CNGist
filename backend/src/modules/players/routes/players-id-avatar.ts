import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { getPlayerAvatar } from "../player-avatar";
import { fail } from "../../../../../shared/src/api-errors";

type Context = { params: Promise<{ id: number }> };

async function reply(id: number, force: boolean) {
  try {
    const { status, ...body } = await getPlayerAvatar(id, force);
    // TTL 由数据库负责，手动刷新不受浏览器或 CDN 的旧 JSON 影响。
    return jsonResponse(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonResponse(fail("avatarUnavailable"), { status: 503 });
  }
}

export async function GET(request: ApiRequest) {
  return reply(pathEntityId(request.params.id), false);
}

export async function POST(request: ApiRequest) {
  // 仅接受同源脚本的 JSON 请求，避免跨站表单触发强制刷新。
  if (!headerValue(request, "content-type")?.startsWith("application/json") || headerValue(request, "sec-fetch-site") === "cross-site") {
    return jsonResponse(fail("badOrigin"), { status: 403 });
  }
  const account = await currentAccount();
  if (!account || account.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const id = pathEntityId(request.params.id);
  if (account.claimedPlayerId !== id) return jsonResponse(fail("avatarSelfOnly"), { status: 403 });
  return reply(id, true);
}
