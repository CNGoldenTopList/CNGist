import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { appOrigin } from "../../auth/providers";
import { revokeDevice } from "../tracker-device-service";
import { fail } from "../../../../../shared/src/api-errors";

/** 撤销自己的设备。撤销后 authenticateDevice 立刻不再认这个 token。 */
export async function DELETE(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const origin = headerValue(request, "origin");
  if (origin && origin !== appOrigin()) return jsonResponse(fail("badOrigin"), { status: 403 });
  const id = pathEntityId(request.params.id);
  const result = await revokeDevice(owner.id, id);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, id: result.data.id });
}
