import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { setSuggestionDueAt } from "../../admin/admin-commands";

/** 设定或延长一条意见箱意见的投票截止时间。 */
export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => setSuggestionDueAt(admin, id, body));
}
