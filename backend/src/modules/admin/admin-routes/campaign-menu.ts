import { type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { saveCampaignMenu } from "../admin-commands";

export async function PUT(request: ApiRequest) {
  return adminCommand(request, (admin, body) => saveCampaignMenu(admin, body));
}
