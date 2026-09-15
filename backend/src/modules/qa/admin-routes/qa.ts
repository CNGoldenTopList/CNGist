import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { saveQaEntry } from "../../admin/admin-commands";

export async function POST(request: ApiRequest) {
  return adminCommand(request, saveQaEntry);
}
