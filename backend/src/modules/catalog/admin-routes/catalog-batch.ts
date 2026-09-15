import { adminCommand } from "../../auth/admin-route";
import { batchCatalog } from "../batch";
import type { ApiRequest } from "../../../plugins/http";
export async function POST(request: ApiRequest) { return adminCommand(request, batchCatalog); }
