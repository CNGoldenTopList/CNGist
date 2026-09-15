import { pathEntityId } from "../../../../../shared/src/entity-id";
import { requestUrl, type ApiRequest } from "../../../plugins/http";
import { adminCommand, adminRead } from "../../auth/admin-route";
import { saveGoldenRoomRule } from "../../admin/admin-commands";
import { readGoldenRoomSettings } from "../golden-room-service";

export async function GET(request: ApiRequest) {
  return adminRead(() => readGoldenRoomSettings(requestUrl(request).searchParams.has("mapId") ? pathEntityId(requestUrl(request).searchParams.get("mapId")!) : undefined));
}
export async function POST(request: ApiRequest) {
  return adminCommand(request, saveGoldenRoomRule);
}
