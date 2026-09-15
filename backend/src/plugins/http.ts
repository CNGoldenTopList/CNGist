/** Fastify 请求上下文，隔离会话与单请求目录投影。 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getConfig } from "../config";
export type ApiRequest = FastifyRequest<{ Params: Record<string, string>; Body: Record<string, unknown> }>;
export type RequestContext = { request: ApiRequest; reply: FastifyReply; after: Array<() => unknown>; cache: Map<string, unknown> };
export const requestContext = new AsyncLocalStorage<RequestContext>();
export function context() {
  const current = requestContext.getStore();
  if (!current) throw new Error("当前操作需要请求上下文");
  return current;
}
export function headerValue(request: ApiRequest, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
export function requestUrl(request: ApiRequest) { return new URL(request.url, getConfig().server.origin); }
export function jsonResponse(body: unknown, options: { status?: number; headers?: Record<string, string> } = {}) {
  return context().reply.code(options.status ?? 200).headers(options.headers ?? {}).send(body);
}
export function redirectResponse(url: string | URL) { return context().reply.redirect(String(url)); }
export function afterResponse(run: () => unknown) { context().after.push(run); }
export async function cookies() {
  const { request, reply } = context();
  return {
    get: (name: string) => request.cookies[name] === undefined ? undefined : { value: request.cookies[name]! },
    set: (name: string, value: string, options: import("@fastify/cookie").CookieSerializeOptions) => reply.setCookie(name, value, options),
  };
}
