import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { saveCampaignLayout } from "../../admin/admin-commands";

/** 大厅、大厅内地图与根级顺序按地图包整体替换。 */
export async function PUT(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => saveCampaignLayout(admin, id, body));
}
