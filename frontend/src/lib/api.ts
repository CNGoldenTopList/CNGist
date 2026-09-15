/**
 * 后端调用的唯一出口。前端与 Fastify 同源部署，所有路径都是相对的，
 * 会话 Cookie 由浏览器自动带上，写接口不需要也拿不到任何令牌。
 */
import type { ApiReply } from "@/i18n";

export type ApiResult<T> = { ok: boolean; status: number; data: T & ApiReply };

async function request<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: init?.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json", ...init?.headers }
        : init?.headers,
    });
    const data = (await response.json().catch(() => ({}))) as T & ApiReply;
    return { ok: response.ok && data.ok !== false, status: response.status, data };
  } catch {
    // 请求根本没发出去时也走同一条错误码通道，界面照当前语言播报。
    return { ok: false, status: 0, data: { ok: false, code: "networkError" } as T & ApiReply };
  }
}

const body = (value: unknown) => JSON.stringify(value);

export const api = {
  get: <T = Record<string, unknown>>(path: string) => request<T>(path),
  post: <T = Record<string, unknown>>(path: string, payload?: unknown) =>
    request<T>(path, { method: "POST", body: payload === undefined ? undefined : body(payload) }),
  patch: <T = Record<string, unknown>>(path: string, payload?: unknown) =>
    request<T>(path, { method: "PATCH", body: payload === undefined ? undefined : body(payload) }),
  put: <T = Record<string, unknown>>(path: string, payload?: unknown) =>
    request<T>(path, { method: "PUT", body: payload === undefined ? undefined : body(payload) }),
  delete: <T = Record<string, unknown>>(path: string, payload?: unknown) =>
    request<T>(path, { method: "DELETE", body: payload === undefined ? undefined : body(payload) }),
  upload: <T = Record<string, unknown>>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};
