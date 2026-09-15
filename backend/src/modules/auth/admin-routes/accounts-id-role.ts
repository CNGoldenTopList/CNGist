import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../admin-route";
import { setAdministrator } from "../../admin/admin-commands";

export async function PATCH(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => setAdministrator(admin, id, body), true);
}
