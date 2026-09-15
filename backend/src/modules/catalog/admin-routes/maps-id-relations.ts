import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { saveMapRelations } from "../../admin/admin-commands";

/** 只替换这一张地图的边，并在事务内校验无环。 */
export async function PUT(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => saveMapRelations(admin, id, body));
}
