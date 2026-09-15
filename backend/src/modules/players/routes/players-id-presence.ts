import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { trackerPresence } from "../../tracker/tracker-presence-service";

export async function GET(request: ApiRequest) {
  const presence = await trackerPresence.readPlayer(pathEntityId(request.params.id));
  return jsonResponse({ presence }, { status: presence ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
