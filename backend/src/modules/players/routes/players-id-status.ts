import { pathEntityId } from "../../../../../shared/src/entity-id";
import { fail } from "../../../../../shared/src/api-errors";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { updateOwnPlayerStatus } from "../player-status";

export async function PATCH(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const result = await updateOwnPlayerStatus(owner.id, pathEntityId(request.params.id), request.body?.status);
  return jsonResponse(result, { status: result.ok ? 200 : result.status });
}
