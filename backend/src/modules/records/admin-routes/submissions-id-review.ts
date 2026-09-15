import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { reviewSubmission } from "../../admin/admin-commands";

/** 审核结论与同图冲突隐藏在同一个事务里完成。 */
export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => reviewSubmission(admin, id, body));
}
