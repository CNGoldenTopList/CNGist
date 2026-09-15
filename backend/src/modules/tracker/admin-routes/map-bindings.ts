import { entityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand, adminRead } from "../../auth/admin-route";
import {
  listApprovedMapBindings, listPendingMapBindings, reviewMapBinding, revokeMapBinding,
} from "../tracker-map-binding-service";

export async function GET() {
  return adminRead(async () => ({
    pending: await listPendingMapBindings(),
    approved: await listApprovedMapBindings(),
  }));
}

export async function PATCH(request: ApiRequest) {
  return adminCommand(request, async (admin, body) => {
    const id = entityId(body.id);
    if (!id) return { ok: false as const, error: "缺少配对 ID。", status: 400 };
    // revoke 撤销的是已生效的配对，review 只处理待审的，两条路径不混用。
    return body.revoke === true ? revokeMapBinding(admin, id, body.note) : reviewMapBinding(admin, id, body);
  });
}
