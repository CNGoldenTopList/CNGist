import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { toSessionAccount, updateProfile } from "../accounts";
import { currentSession } from "../session";
import { sendVerification } from "../email-flows";
import { fail } from "../../../../../shared/src/api-errors";

export async function PATCH(request: ApiRequest) {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });

  const body = await Promise.resolve(request.body).catch(() => null) as { displayName?: string; email?: string } | null;
  if (!body) return jsonResponse(fail("requestMalformed"), { status: 400 });

  const result = await updateProfile(active.accountId, body);
  if (!result.ok) return jsonResponse(result, { status: 400 });
  // updateProfile 会把改过的邮箱重置成未验证，这里补一封新的验证信
  if (body.email !== undefined) await sendVerification(active.accountId);
  return jsonResponse({ ok: true, account: toSessionAccount(result.data) });
}
