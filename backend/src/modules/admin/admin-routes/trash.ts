import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { moveToTrash } from "../admin-commands";
import { adminRead } from "../../auth/admin-route";
import { loadTrash } from "../admin-service";

/** 回收站条目与确认票。 */
export async function GET() {
  return adminRead(loadTrash);
}

export async function POST(request: ApiRequest) {
  return adminCommand(request, (admin, body) => moveToTrash(admin, body));
}
