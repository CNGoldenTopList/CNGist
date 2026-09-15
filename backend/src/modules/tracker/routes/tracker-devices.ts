import { jsonResponse } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { listDevices } from "../tracker-device-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 本人已授权的设备。不返回 token，也不返回摘要。 */
export async function GET() {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  return jsonResponse({ ok: true, devices: await listDevices(owner.id) });
}
