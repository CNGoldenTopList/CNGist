/** 仅供网站服务端调用，不接受 OneBot token，不提供运维执行接口。 */
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { MessageError } from "./messages.mjs";

function authorized(req, token) {
  const actual = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${token}`);
  return Boolean(token) && actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(req) {
  if (String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new MessageError(415, "invalid_content_type", "需要 application/json");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 64 * 1024) throw new MessageError(413, "body_too_large", "请求体过大");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    if (Object.keys(body).some((key) => !["groupIds", "text"].includes(key))) throw new Error();
    return body;
  } catch {
    throw new MessageError(400, "invalid_body", "请求体必须是仅含 groupIds、text 的 JSON 对象");
  }
}

export function createApiServer({ config, messages }) {
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (!authorized(req, config.apiToken)) return reply(401, { error: "unauthorized" });
    if (req.url !== "/v1/messages" || req.method !== "POST") return reply(404, { error: "not_found" });
    if (busy) return reply(429, { error: "busy" });
    busy = true;
    try {
      const results = await messages.push(await readJson(req));
      reply(results.every((result) => result.ok) ? 200 : 207, { results });
    } catch (error) {
      if (error instanceof MessageError) reply(error.status, { error: error.code, message: error.message });
      else {
        process.stderr.write(`[qqbot] 推送接口失败：${error.stack ?? error.message}\n`);
        reply(500, { error: "internal_error" });
      }
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
