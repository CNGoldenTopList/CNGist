import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { fail } from "../../../../../shared/src/api-errors";
import { trackerPresence } from "../tracker-presence-service";
import { withDevice } from "../device-route";

export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => trackerPresence.write(principal, body), 1024 * 1024);
}

/** Only the website session owner can read their devices. No public player/account selector. */
export async function GET() {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  return jsonResponse({ ok: true, devices: await trackerPresence.read(owner.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
