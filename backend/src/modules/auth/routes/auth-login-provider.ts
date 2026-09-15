import { jsonResponse, context, requestUrl, type ApiRequest } from "../../../plugins/http";
import { authorizationUrl, newPkce, randomToken } from "../oidc";
import { appOrigin, OIDC_TX_COOKIE, oidcConfig } from "../providers";

/** 发起授权。state / nonce / code_verifier 放进短命 HttpOnly Cookie 带过跳转， */
export async function GET(request: ApiRequest) {
  const { provider } = request.params;
  if (provider !== "diving-fish") return jsonResponse({ error: "unknown_provider" }, { status: 404 });

  const config = oidcConfig();
  if (!config) return jsonResponse({ error: "provider_not_configured" }, { status: 503 });

  const url = requestUrl(request);
  // 绑定必须显式声明。否则「已登录时用别人的账号登录」会静默把对方身份挂到自己名下。
  const mode = url.searchParams.get("mode") === "bind" ? "bind" : "login";
  const next = safeNext(url.searchParams.get("next"));

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = newPkce();

  const response = context().reply;
  const redirectTarget = await authorizationUrl(config, { state, nonce, challenge });
  response.setCookie(OIDC_TX_COOKIE, JSON.stringify({ state, nonce, verifier, mode, next }), {
    httpOnly: true,
    secure: appOrigin().startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response.redirect(String(redirectTarget));
}

/** 只允许站内相对路径，挡开放重定向。 */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/account";
  return value;
}
