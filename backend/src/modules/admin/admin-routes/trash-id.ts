import { pathEntityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { restoreFromTrash, confirmTrashDeletion } from "../admin-commands";

export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, (admin, body) => {
    if (body.action === "restore") return restoreFromTrash(admin, id);
    if (body.action === "confirm" || body.action === "vote") return confirmTrashDeletion(admin, id);
    return Promise.resolve({ ok: false as const, error: "回收站操作无效。", status: 400 });
  });
}
