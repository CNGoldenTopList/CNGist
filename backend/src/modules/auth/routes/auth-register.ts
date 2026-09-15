import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { registerWithPassword, toSessionAccount } from "../accounts";
import { createSession } from "../session";
import { requestMeta } from "../request";
import { sendVerification } from "../email-flows";
import { fail } from "../../../../../shared/src/api-errors";

export async function POST(request: ApiRequest) {
  const body = await Promise.resolve(request.body).catch(() => null) as { email?: string; password?: string; displayName?: string } | null;
  if (!body?.email || !body.password) return jsonResponse(fail("missingCredentials"), { status: 400 });

  const result = await registerWithPassword({ email: body.email, password: body.password, displayName: body.displayName ?? "" });
  if (!result.ok) return jsonResponse(result, { status: 400 });

  await createSession(result.data.id, ["pwd"], requestMeta(request));
  // 发信失败不影响注册结果，用户可以在账户页重发
  await sendVerification(result.data.id);
  return jsonResponse({ ok: true, account: toSessionAccount(result.data) });
}
