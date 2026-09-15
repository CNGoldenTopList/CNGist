import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { unlinkPlayer } from "../../admin/admin-commands";

export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin) => unlinkPlayer(admin, id));
}
