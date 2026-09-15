import { entityId } from "../../../../../shared/src/entity-id";
import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { createCatalogEntity, updateCampaign, updateChallenge, updateMap } from "../../admin/admin-commands";

/** 新建地图包/地图/挑战：带子树的创建也只发一个请求、走一个事务。 */
export async function POST(request: ApiRequest) {
  return adminCommand(request, (admin, body) => createCatalogEntity(admin, body));
}

/** 目录条目的整份表单保存：后台编辑框每次都提交全部可编辑字段，未出现的字段 */
export async function PUT(request: ApiRequest) {
  return adminCommand(request, async (admin, body) => {
    const id = entityId(body.id);
    if (!id) return { ok: false as const, error: "缺少目标编号。", status: 400 };
    if (body.kind === "campaign") return updateCampaign(admin, id, body);
    if (body.kind === "map") return updateMap(admin, id, body);
    if (body.kind === "challenge") return updateChallenge(admin, id, body);
    return { ok: false as const, error: "目录类型无效。", status: 400 };
  });
}
