import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { decideSuggestion } from "../../admin/admin-commands";

/** 同意/驳回一条意见箱意见。 */
export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => decideSuggestion(admin, id, body));
}
