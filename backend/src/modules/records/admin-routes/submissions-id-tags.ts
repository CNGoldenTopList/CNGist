import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { upsertSubmissionTag } from "../../admin/admin-commands";

/** 追加或更新一条挑战记录标签，不必像详情页那样每次把整份标签数组发回来。 */
export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => upsertSubmissionTag(admin, id, body));
}
