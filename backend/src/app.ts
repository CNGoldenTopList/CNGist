/** Fastify 应用组装；可独立注入请求进行必要验证。 */
import { campaignSuggestions } from "./integrations/goldberries";
import { siteAdministrators } from "./modules/site/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { availableProviders, mailAvailable } from "./modules/auth/providers";
import { repositoryRoot, getConfig } from "./config";
import { requestContext, type ApiRequest } from "./plugins/http";
import { routes } from "./routes";
export async function buildApp() {
  const config = getConfig();
  const app = Fastify({ trustProxy: config.server.trustProxy, bodyLimit: 9 * 1024 * 1024, logger: { serializers: { req: request => ({ method: request.method, url: request.url?.split("?")[0], remoteAddress: request.ip }) }, redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"] } });
  await app.register(cookie);
  await app.register(multipart);
  await app.register(rateLimit, { global: false });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("cache-control", "no-store").header("x-content-type-options", "nosniff");
    // 此端点只接受专用 Bearer token，绝不回退 Cookie；其余写接口仍做来源检查。
    const clipSubmission = request.method === "POST" && request.url.split("?")[0] === "/api/clip/submissions";
    if (!clipSubmission && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.origin;
      if ((origin && origin !== new URL(config.server.origin).origin) || request.headers["sec-fetch-site"] === "cross-site") return reply.code(403).send({ ok: false, error: "invalid_origin" });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) request.log.error({ err }, "request failed");
    return reply.code(status).send({ ok: false, error: status === 413 ? "scope_too_large" : status < 500 ? "invalid_request" : "server_error" });
  });
  app.get("/api/submissions/campaign-suggestions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (_request, reply) => {
    try { return await campaignSuggestions(); } catch (err) { _request.log.error({ err }, "campaign suggestions unavailable"); return reply.code(503).send({ ok: false, error: "source_unavailable" }); }
  });
  app.get("/health", () => ({ ok: true }));
  app.get("/api/config", async () => ({ providers: availableProviders(), mailAvailable: mailAvailable(), bindingArticleUrl: config.bilibili.bindingArticleUrl, icpNumber: config.site?.icpNumber?.trim() ?? "", developers: config.site?.developers ?? [], sponsorship: config.site?.sponsorship?.trim() ?? "", donation: config.site?.donation ? { label: config.site.donation.label.trim(), url: config.site.donation.url.trim() } : null, sourceUrl: config.site?.sourceUrl?.trim() ?? "", administrators: await siteAdministrators() }));
  app.get("/api/reference.md", async (_request, reply) => reply.type("text/markdown; charset=utf-8").send(await readFile(resolve(repositoryRoot, "backend/docs/api.md"), "utf8")));
  for (const route of routes) {
    app.route({ method: route.method, url: route.url, bodyLimit: route.url.startsWith("/api/tracker/") ? 9 * 1024 * 1024 : route.url.includes("attachments") ? 6 * 1024 * 1024 : 2 * 1024 * 1024,
      config: route.method === "POST" && /^\/api\/auth\/(login|register|password)/.test(route.url) ? { rateLimit: { max: 20, timeWindow: "1 minute" } } : {},
      handler: async (request, reply) => {
        const state = { request: request as ApiRequest, reply, after: [] as Array<() => unknown>, cache: new Map<string, unknown>() };
        reply.raw.once("finish", () => { for (const work of state.after) void Promise.resolve().then(work).catch(err => request.log.error({ err }, "background task failed")); });
        return requestContext.run(state, () => route.handler(request as ApiRequest));
      },
    });
  }
  return app;
}
