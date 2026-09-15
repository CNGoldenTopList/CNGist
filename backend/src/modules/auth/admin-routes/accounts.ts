import { requestUrl, type ApiRequest } from "../../../plugins/http";
import { adminRead } from "../admin-route";
import { loadManagedAccounts } from "../../admin/admin-service";

export async function GET(request: ApiRequest) {
  const query = requestUrl(request).searchParams.get("q") ?? "";
  return adminRead(() => loadManagedAccounts(query), true);
}
