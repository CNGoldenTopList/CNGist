/**
 * 设备授权请求参数的校验。**纯逻辑，两端共用**。
 *
 * 前端在渲染确认页之前调用：参数不合法就不该让玩家去确认一个我们不打算兑现
 * 的请求。服务端在签发授权码时再校验一遍 —— 客户端说了不算，但两边的判断
 * 必须完全一致，所以只有这一份。
 *
 * 密钥生成、摘要与 PKCE 兑换（要 node:crypto）留在后端。
 */
export const DEVICE_NAME_MAX = 64;
const STATE_MAX = 512;

export type CodeChallenge = { method: "S256"; value: string };

/** 回环重定向地址校验（RFC 8252 §7.3）。 */
export function parseLoopbackRedirect(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "http:") return null;
  if (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]" && url.hostname !== "::1") return null;
  if (url.username || url.password) return null;
  if (url.hash) return null;
  if (!url.port) return null;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const host = url.hostname === "127.0.0.1" ? "127.0.0.1" : "[::1]";
  // 只保留 path，丢掉调用方自带的 query：code/state 由我们自己拼。
  const path = url.pathname === "/" ? "/" : url.pathname;
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(path)) return null;
  return `http://${host}:${port}${path}`;
}

/** 把授权码挂到已校验过的回环地址上。state 原样回传，长度设限。 */
export function buildRedirect(redirectUri: string, code: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function parseState(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > STATE_MAX) return null;
  return /^[\x20-\x7e]+$/.test(raw) ? raw : null;
}

/** 只支持 S256。plain 等于没有 PKCE，不接受。 */
export function parseCodeChallenge(value: unknown, method: unknown): CodeChallenge | null {
  if (method !== "S256") return null;
  if (typeof value !== "string") return null;
  // base64url 的 SHA-256 是固定 43 字符，长度对不上直接拒绝。
  return /^[A-Za-z0-9\-_]{43}$/.test(value) ? { method: "S256", value } : null;
}

export function parseDeviceName(raw: unknown, fallback = "未命名设备") {
  if (typeof raw !== "string") return fallback;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, DEVICE_NAME_MAX);
  return name || fallback;
}

export type AuthorizeRequest = {
  redirectUri: string | null;
  codeChallenge: string;
  state: string | null;
  deviceName: string;
  clientName: string;
};

/** 校验 mod 带来的授权参数。**在展示确认页之前调用** —— 参数不合法就不该让玩家 */
export function parseAuthorizeRequest(params: {
  redirect_uri?: unknown; code_challenge?: unknown; code_challenge_method?: unknown;
  state?: unknown; device_name?: unknown; client_name?: unknown;
}): AuthorizeRequest | null {
  const challenge = parseCodeChallenge(params.code_challenge, params.code_challenge_method);
  if (!challenge) return null;
  const wantsRedirect = params.redirect_uri !== undefined && params.redirect_uri !== null && params.redirect_uri !== "";
  const redirectUri = wantsRedirect ? parseLoopbackRedirect(params.redirect_uri) : null;
  if (wantsRedirect && !redirectUri) return null;
  if (params.state !== undefined && params.state !== null && params.state !== "" && parseState(params.state) === null) return null;
  return {
    redirectUri,
    codeChallenge: challenge.value,
    state: parseState(params.state),
    deviceName: parseDeviceName(params.device_name),
    clientName: parseDeviceName(params.client_name, ""),
  };
}
