import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { requestPasswordReset } from "../email-flows";
import { fail } from "../../../../../shared/src/api-errors";

/** 申请重置。无论邮箱是否存在、是否已验证，一律返回同一句话—— */
export async function POST(request: ApiRequest) {
  const body = await Promise.resolve(request.body).catch(() => null) as { email?: string } | null;
  if (!body?.email) return jsonResponse(fail("emailRequired"), { status: 400 });

  await requestPasswordReset(body.email);
  return jsonResponse({ ok: true, message: "如果该邮箱对应已验证的账户，重置邮件已经发出，请查收。" });
}
