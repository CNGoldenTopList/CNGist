import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { importMapBindings } from "../tracker-map-binding-import";

export async function POST(request: ApiRequest) {
  return adminCommand(request, importMapBindings);
}
