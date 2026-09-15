import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { deleteSuggestion } from "../../admin/admin-commands";

export async function DELETE(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin) => deleteSuggestion(admin, id));
}
