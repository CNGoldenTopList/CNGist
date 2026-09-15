import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { resetPassword } from "../email-flows";
import { fail } from "../../../../../shared/src/api-errors";

export async function POST(request: ApiRequest) {
  const body = await Promise.resolve(request.body).catch(() => null) as { token?: string; password?: string } | null;
  if (!body?.token || !body.password) return jsonResponse(fail("requestIncomplete"), { status: 400 });

  const result = await resetPassword(body.token, body.password);
  if (!result.ok) return jsonResponse(result, { status: 400 });
  return jsonResponse({ ok: true });
}
