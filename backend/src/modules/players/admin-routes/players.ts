import { type ApiRequest } from "../../../plugins/http";
import { adminCommand, adminRead } from "../../auth/admin-route";
import { createPlayer } from "../../admin/admin-commands";
import { loadPlayerDirectory } from "../../admin/admin-service";

/** 玩家状态与认领账户的联系方式。单个玩家的修改走 /api/admin/players/[id]。 */
export async function GET() {
  return adminRead(loadPlayerDirectory);
}

/** 管理员直接建档一个新玩家，不经过认领申请。 */
export async function POST(request: ApiRequest) {
  return adminCommand(request, (admin, body) => createPlayer(admin, body));
}
