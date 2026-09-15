/** 设备授权的纯逻辑：回环地址校验、PKCE 校验、密钥生成与摘要。 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
/* 请求参数的校验住在 shared：确认页要在渲染之前用同一套判断。 */
import {
  buildRedirect, DEVICE_NAME_MAX, parseAuthorizeRequest, parseCodeChallenge, parseDeviceName,
  parseLoopbackRedirect, parseState, type AuthorizeRequest, type CodeChallenge,
} from "../../../../shared/src/tracker/device-auth-request";
export { buildRedirect, DEVICE_NAME_MAX, parseAuthorizeRequest, parseCodeChallenge, parseDeviceName, parseLoopbackRedirect, parseState };
export type { AuthorizeRequest, CodeChallenge };


/** 授权码有效期。够玩家在浏览器里点一下确认，不够别人拿去慢慢试。 */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export function newSecret() {
  return randomBytes(32).toString("base64url");
}

/** 与 session/emailToken 一致：库里只存 SHA-256，明文只在签发的那一次出现。 */
export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 兑换时校验：SHA-256(verifier) 的 base64url 必须等于当初存下的 challenge。 */
export function verifyCodeVerifier(verifier: unknown, challenge: string) {
  if (typeof verifier !== "string") return false;
  // RFC 7636 规定 verifier 长度 43–128。
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return equal(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

/** `Authorization: Bearer <token>` 里的 token，取不到返回 null。 */
export function bearerToken(header: string | null) {
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(header.trim());
  return match ? match[1] : null;
}
