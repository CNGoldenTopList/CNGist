import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { listUnboundScopes, proposeMapBinding } from "../tracker-map-binding-service";
import { fail } from "../../../../../shared/src/api-errors";

async function activeAccount() {
  const owner = await currentAccount();
  return owner?.status === "active" ? owner : null;
}

/** 本账户上传过、但还没有生效配对的地图，等玩家自己指认。 */
export async function GET() {
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  return jsonResponse({ ok: true, scopes: await listUnboundScopes(owner.id) });
}

export async function POST(request: ApiRequest) {
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await proposeMapBinding(owner.id, body as Record<string, unknown>);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, id: result.data.id }, { status: 201 });
}
