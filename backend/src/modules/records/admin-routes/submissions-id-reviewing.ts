import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { setSubmissionReviewing } from "../../admin/admin-commands";

/** 认领/放弃「审核中」，并写下给其他管理员看的备注。不改审核状态。 */
export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => setSubmissionReviewing(admin, id, body));
}
