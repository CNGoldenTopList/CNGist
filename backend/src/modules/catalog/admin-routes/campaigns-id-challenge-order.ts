import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { saveMultiMapChallengeOrder } from "../../admin/admin-commands";

/** 调整一个地图包下多地图挑战的顺序，对应地图挑战的 maps/[id]/order。 */
export async function PUT(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => saveMultiMapChallengeOrder(admin, id, body));
}
