import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { updatePlayer } from "../../admin/admin-commands";

export async function PATCH(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => updatePlayer(admin, id, body));
}
