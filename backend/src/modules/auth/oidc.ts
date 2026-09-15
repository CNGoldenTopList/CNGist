/** OIDC 授权码 + PKCE。只硬编码 issuer，端点和公钥全部从发现文档与 JWKS 拉， */
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { OidcProviderConfig } from "./providers";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
};

const DISCOVERY_TTL = 10 * 60 * 1000;
let cache: { at: number; issuer: string; doc: Discovery } | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function discover(config: OidcProviderConfig): Promise<Discovery> {
  if (cache && cache.issuer === config.issuer && Date.now() - cache.at < DISCOVERY_TTL) return cache.doc;
  const response = await fetch(new URL("/.well-known/openid-configuration", config.issuer), { cache: "no-store" });
  if (!response.ok) throw new Error(`发现文档拉取失败：HTTP ${response.status}`);
  const doc = (await response.json()) as Discovery;
  // 防发现文档被掉包指向别处
  if (doc.issuer !== config.issuer) throw new Error(`issuer 不匹配：期望 ${config.issuer}，实际 ${doc.issuer}`);
  cache = { at: Date.now(), issuer: config.issuer, doc };
  jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
  return doc;
}

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export async function authorizationUrl(config: OidcProviderConfig, args: { state: string; nonce: string; challenge: string }) {
  const doc = await discover(config);
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", args.state);
  url.searchParams.set("nonce", args.nonce);
  url.searchParams.set("code_challenge", args.challenge);
  // 对端只收 S256
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type OidcClaims = {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  amr?: string[];
};

export async function exchangeCode(config: OidcProviderConfig, args: { code: string; verifier: string; nonce: string }): Promise<OidcClaims> {
  const doc = await discover(config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: config.redirectUri,
    code_verifier: args.verifier,
    // 对端的 token_endpoint_auth_methods_supported 只有 client_secret_post 和 none，
    // 用 Basic 送凭据会被判成认证失败。
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json()) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.id_token) {
    throw new Error(`换取令牌失败：${payload.error || response.status} ${payload.error_description || ""}`.trim());
  }
  if (!jwks) throw new Error("JWKS 未初始化");

  const { payload: claims } = await jwtVerify(payload.id_token, jwks, {
    issuer: config.issuer,
    audience: config.clientId,
  });
  assertClaims(claims, config.clientId, args.nonce);

  let email = typeof claims.email === "string" ? claims.email : undefined;
  let emailVerified = claims.email_verified === true;
  // 有些实现不把 email 放进 id_token，缺了就去 userinfo 补一次。
  if (!email && doc.userinfo_endpoint && payload.access_token) {
    const info = await fetch(doc.userinfo_endpoint, {
      headers: { authorization: `Bearer ${payload.access_token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (info.ok) {
      const data = (await info.json()) as Record<string, unknown>;
      if (data.sub !== claims.sub) throw new Error("userinfo 的 sub 与 id_token 不一致");
      if (typeof data.email === "string") email = data.email;
      if (data.email_verified === true) emailVerified = true;
      if (!claims.name && typeof data.name === "string") claims.name = data.name;
      if (!claims.preferred_username && typeof data.preferred_username === "string") claims.preferred_username = data.preferred_username;
    }
  }

  const name = [claims.name, claims.nickname, claims.preferred_username].find((value) => typeof value === "string" && value.trim());
  return {
    sub: String(claims.sub),
    email,
    emailVerified,
    name: typeof name === "string" ? name : undefined,
    amr: Array.isArray(claims.amr) ? claims.amr.filter((v): v is string => typeof v === "string") : undefined,
  };
}

/** jwtVerify 只管签名、iss、aud、exp；nonce 与 azp 得自己比。 */
function assertClaims(claims: JWTPayload, clientId: string, nonce: string) {
  if (!claims.sub) throw new Error("id_token 缺少 sub");
  if (claims.nonce !== nonce) throw new Error("nonce 不匹配，可能是重放");
  if (typeof claims.azp === "string" && claims.azp !== clientId) throw new Error("azp 与本应用不符");
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) {
    throw new Error("id_token 含多个 aud 但 azp 不是本应用");
  }
}
