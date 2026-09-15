import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { completeTask } from "../admin-commands";

export async function PATCH(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin) => completeTask(admin, id));
}
