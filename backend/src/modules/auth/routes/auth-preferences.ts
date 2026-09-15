import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { mergePreferences, toSessionAccount } from "../accounts";
import { currentSession } from "../session";
import type { AccountPreferences } from "../../../../../shared/src/account-preferences";
import { fail } from "../../../../../shared/src/api-errors";

export async function PATCH(request: ApiRequest) {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });

  const patch = await Promise.resolve(request.body).catch(() => null) as AccountPreferences | null;
  if (!patch || typeof patch !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });

  const result = await mergePreferences(active.accountId, patch);
  if (!result.ok) return jsonResponse(result, { status: 400 });
  return jsonResponse({ ok: true, account: toSessionAccount(result.data) });
}
