import { jsonResponse, requestUrl, headerValue, type ApiRequest } from "../../../plugins/http";
import { sharedRoutes } from "../shared-route-service";
import { authenticateDevice } from "../tracker-device-service";
import { bearerToken } from "../device-auth";
import { withDevice } from "../device-route";
import { CctError } from "../cct-state";
import { httpStatusForCct } from "../cct-http";
export async function GET(request: ApiRequest) {
  try {
    const q = requestUrl(request).searchParams;
    const owner = await authenticateDevice(bearerToken(headerValue(request,"authorization")));
    return jsonResponse({ ok:true,...await sharedRoutes.list(q.get("sid"),q.get("side"),Number(q.get("offset") ?? 0),owner?.accountId ?? null) });
  } catch (error) {
    if (error instanceof CctError) return jsonResponse({ ok:false,error:error.code },{ status:httpStatusForCct(error.code) });
    console.error("[shared-routes]",error); return jsonResponse({ok:false,error:"server_error"},{status:500});
  }
}
export async function POST(request: ApiRequest) {
  return withDevice(request, async (p,b) => {
    if (b.action === "publish") return sharedRoutes.publish(p,b);
    if (b.action === "delete" && Object.keys(b).every(k => k === "action" || k === "id")) return sharedRoutes.remove(p,b.id);
    throw new CctError("invalid_shared_route");
  });
}
