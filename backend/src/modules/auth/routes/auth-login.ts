import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { loginWithPassword, toSessionAccount } from "../accounts";
import { createSession } from "../session";
import { requestMeta } from "../request";
import { fail } from "../../../../../shared/src/api-errors";

export async function POST(request: ApiRequest) {
  const body = await Promise.resolve(request.body).catch(() => null) as { email?: string; password?: string } | null;
  if (!body?.email || !body.password) return jsonResponse(fail("missingCredentials"), { status: 400 });

  const result = await loginWithPassword({ email: body.email, password: body.password });
  // 401 而不是 400：这是认证失败，不是请求格式问题
  if (!result.ok) return jsonResponse(result, { status: 401 });

  await createSession(result.data.id, ["pwd"], requestMeta(request));
  return jsonResponse({ ok: true, account: toSessionAccount(result.data) });
}
