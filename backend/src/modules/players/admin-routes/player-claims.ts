import { adminRead } from "../../auth/admin-route";
import { loadPlayerClaimRequests } from "../../admin/admin-service";

export async function GET() {
  return adminRead(loadPlayerClaimRequests);
}
