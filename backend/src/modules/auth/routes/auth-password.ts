import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { setPassword } from "../accounts";
import { currentSession } from "../session";
import { notifyPasswordChanged } from "../email-flows";
import { fail } from "../../../../../shared/src/api-errors";

export async function POST(request: ApiRequest) {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });

  const body = await Promise.resolve(request.body).catch(() => null) as { currentPassword?: string; nextPassword?: string } | null;
  if (!body?.nextPassword) return jsonResponse(fail("passwordRequired"), { status: 400 });

  const result = await setPassword(active.accountId, { currentPassword: body.currentPassword ?? "", nextPassword: body.nextPassword });
  if (!result.ok) return jsonResponse(result, { status: 400 });
  await notifyPasswordChanged(active.accountId);
  return jsonResponse({ ok: true });
}
