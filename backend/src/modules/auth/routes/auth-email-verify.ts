import { jsonResponse, redirectResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { sendVerification, verifyEmail } from "../email-flows";
import { appOrigin } from "../providers";
import { currentSession } from "../session";
import { fail } from "../../../../../shared/src/api-errors";
import { translate } from "../../../../../shared/src/i18n/format";

/* 回跳到页面时同时带上原文与错误码：账户页按当前网站语言播报，
   老链接或不认识 code 的客户端仍能读到中文原文。 */
function setOutcome(target: URL, result: { error: string; code?: string }) {
  target.searchParams.set("auth_error", result.error);
  if (result.code) target.searchParams.set("auth_error_code", result.code);
}

/** 邮件里的链接。用户是从信箱点进来的，所以回跳到页面而不是返回 JSON。 */
export async function GET(request: ApiRequest) {
  const token = requestUrl(request).searchParams.get("token");
  const target = new URL("/account", appOrigin());
  if (!token) {
    setOutcome(target, fail("verifyLinkIncomplete"));
    return redirectResponse(target);
  }
  const result = await verifyEmail(token);
  if (result.ok) {
    target.searchParams.set("auth_notice", translate("zh-CN", "account.emailVerified"));
    target.searchParams.set("auth_notice_key", "account.emailVerified");
  } else setOutcome(target, result);
  return redirectResponse(target);
}

/** 重新发送验证邮件。 */
export async function POST() {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });

  const result = await sendVerification(active.accountId);
  if (!result.ok) return jsonResponse(result, { status: 400 });
  return jsonResponse({ ok: true });
}
