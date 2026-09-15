import { jsonResponse } from "../../../plugins/http";
import { toSessionAccount } from "../accounts";
import { currentAccount } from "../session";

export async function GET() {
  const row = await currentAccount();
  return jsonResponse({ account: row ? toSessionAccount(row) : null });
}
