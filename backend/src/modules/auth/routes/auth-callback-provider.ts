import { jsonResponse, context, headerValue, requestUrl, type ApiRequest } from "../../../plugins/http";
import { exchangeCode } from "../oidc";
import { resolveAccountForIdentity } from "../link";
import { appOrigin, OIDC_TX_COOKIE, oidcConfig } from "../providers";
import { createSession, currentSession } from "../session";

type Transaction = { state: string; nonce: string; verifier: string; mode: "login" | "bind"; next: string };

export async function GET(request: ApiRequest) {
  const { provider } = request.params;
  if (provider !== "diving-fish") return jsonResponse({ error: "unknown_provider" }, { status: 404 });

  const config = oidcConfig();
  if (!config) return jsonResponse({ error: "provider_not_configured" }, { status: 503 });

  const url = requestUrl(request);
  const failure = url.searchParams.get("error");
  if (failure) return fail(`授权被拒绝：${failure}`);

  const raw = headerValue(request, "cookie")?.match(/(?:^|;\s*)cngist_oidc_tx=([^;]+)/)?.[1];
  if (!raw) return fail("登录会话已过期，请重新发起");

  let tx: Transaction;
  try { tx = JSON.parse(decodeURIComponent(raw)) as Transaction; }
  catch { return fail("登录状态无法解析"); }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return fail("回调缺少 code");
  // 常量时间比较意义不大（state 是一次性的），但必须比
  if (!state || state !== tx.state) return fail("state 不匹配，请重新登录");

  let claims;
  try { claims = await exchangeCode(config, { code, verifier: tx.verifier, nonce: tx.nonce }); }
  catch (error) { return fail(error instanceof Error ? error.message : "换取令牌失败"); }

  // 只有显式的绑定流程才把身份挂到当前账户上
  const active = tx.mode === "bind" ? await currentSession() : null;

  let outcome;
  try {
    outcome = await resolveAccountForIdentity({
      provider: "diving-fish",
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      displayName: claims.name,
    }, active?.accountId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "账户关联失败");
  }

  if (!active) {
    await createSession(outcome.accountId, claims.amr?.length ? claims.amr : ["diving-fish"], {
      userAgent: headerValue(request, "user-agent") ?? undefined,
      ip: request.ip,
    });
  }

  const target = new URL(tx.next, appOrigin());
  if (target.origin !== new URL(appOrigin()).origin) return fail("登录回跳地址无效");
  const response = context().reply;
  const redirectTarget = target;
  response.clearCookie(OIDC_TX_COOKIE, { path: "/" });
  return response.redirect(String(redirectTarget));
}

function fail(message: string) {
  const target = new URL("/account", appOrigin());
  target.searchParams.set("auth_error", message);
  const response = context().reply;
  const redirectTarget = target;
  response.clearCookie(OIDC_TX_COOKIE, { path: "/" });
  return response.redirect(String(redirectTarget));
}
