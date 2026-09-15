import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { appOrigin } from "../../auth/providers";
import { trackerCct } from "../tracker-cct-service";
import { fail } from "../../../../../shared/src/api-errors";

async function guard(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return { error: jsonResponse(fail("signInRequired"), { status: 401 }) };
  const origin = headerValue(request, "origin");
  if (origin && origin !== appOrigin()) return { error: jsonResponse(fail("badOrigin"), { status: 403 }) };
  return { owner };
}

/** 保存开关。关闭后设备 token 仍然存在，但 authenticateDevice 会拒绝， */
export async function PATCH(request: ApiRequest) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  const body = await Promise.resolve(request.body).catch(() => null) as { saveHistory?: unknown } | null;
  if (!body || typeof body.saveHistory !== "boolean") {
    return jsonResponse(fail("requestMalformed"), { status: 400 });
  }
  const result = await trackerCct.setHistoryEnabled(gate.owner.id, body.saveHistory);
  return jsonResponse({ ok: true, saveHistory: result.enabled });
}

/** 删除全部已保存的游戏内统计。同时轮换授权时期并关闭保存， */
export async function DELETE(request: ApiRequest) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  await trackerCct.clearHistory(gate.owner.id);
  return jsonResponse({ ok: true, saveHistory: false });
}
