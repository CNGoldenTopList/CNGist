import { getConfig } from "../../config";
/** 登录方式登记表。**前端不硬编码任何 provider**。 */
export type AuthProviderId = "password" | "diving-fish";
export type AuthProviderKind = "password" | "oidc";

export type AuthProviderDescriptor = {
  id: AuthProviderId;
  kind: AuthProviderKind;
  /** 登录按钮上的字，是一句话。 */
  label: string;
  /** 这种登录方式的名称，是个名词。列表里用它，别拿 label 凑合。 */
  name: string;
  /** OIDC 用；口令登录走表单，没有跳转入口。 */
  startPath?: string;
};

export type OidcProviderConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
};

/** 配齐了才算数，缺一项就当没有这个 provider。 */
export function oidcConfig(): OidcProviderConfig | null {
  const issuer = getConfig().auth.oidc?.issuer;
  const clientId = getConfig().auth.oidc?.clientId;
  const clientSecret = getConfig().auth.oidc?.clientSecret;
  const redirectUri = getConfig().auth.oidc?.redirectUri;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return { issuer, clientId, clientSecret, redirectUri, scopes: getConfig().auth.oidc?.scopes || "openid profile" };
}

export function passwordLoginEnabled() {
  return getConfig().auth.passwordEnabled;
}

/** 公开配置只返回可用入口，不返回提供方凭据。 */
export function availableProviders(): AuthProviderDescriptor[] {
  const list: AuthProviderDescriptor[] = [];
  if (passwordLoginEnabled()) {
    list.push({ id: "password", kind: "password", label: "使用邮箱与密码登录", name: "邮箱与密码" });
  }
  if (oidcConfig()) {
    list.push({ id: "diving-fish", kind: "oidc", label: "使用水鱼账号登录", name: "水鱼账号", startPath: "/api/auth/login/diving-fish" });
  }
  return list;
}

/** 发信没配置时，前端要隐藏「忘记密码」，而不是让用户点了石沉大海。 */
export function mailAvailable() {
  return Boolean(getConfig().mail?.host && getConfig().mail?.user && getConfig().mail?.password);
}

export function appOrigin() {
  return getConfig().server.origin || "http://127.0.0.1:8267";
}

/** 授权往返期间存 state/nonce/verifier 的短命 Cookie 名。 */
export const OIDC_TX_COOKIE = "cngist_oidc_tx";
