/**
 * QQ 群机器人入口：以 OneBot v11 反向 WebSocket 服务端的形式等 NapCat 连进来。
 * NapCat 在哪台机器上都行，只要它能出站连到这里；它自己不需要开放任何入站端口。
 */
import http from "node:http";
import { WebSocketServer } from "ws";
import { config, assertConfig, isLoopback } from "./config.mjs";
import { attach, connectionCount, isConnected, setEventHandler } from "./onebot.mjs";
import { pathToFileURL } from "node:url";
import { createDispatcher } from "./commands.mjs";
import { createMessageService } from "./messages.mjs";
import { startDailySummaryWorker } from "./daily-summary.mjs";
import { startGoldenRoomWorker } from "./golden-rooms.mjs";
import { createApiServer } from "./api.mjs";

export async function startBot({ createDispatch = createDispatcher } = {}) {
  assertConfig();

  /** IPv4-mapped IPv6（::ffff:1.2.3.4）统一成点分形式再比对。 */
  function normalizeIp(address) {
    const value = String(address ?? "");
    return value.startsWith("::ffff:") ? value.slice(7) : value;
  }

  /** 来源 IP 白名单。留空表示不限制，只有回环监听时才允许这么配。 */
  function allowedSource(address) {
    if (!config.allowIps.length) return true;
    return config.allowIps.includes(normalizeIp(address));
  }

  /** 握手鉴权：Authorization: Bearer <token>，或 NapCat 也支持的 ?access_token=。 */
  function authorized(req) {
    const header = String(req.headers.authorization ?? "");
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : header;
    if (bearer && bearer === config.accessToken) return true;
    const query = new URL(req.url, "http://placeholder").searchParams.get("access_token");
    return Boolean(query) && query === config.accessToken;
  }

  const messages = createMessageService();
  const stopGoldenRooms = await startGoldenRoomWorker({config,messages,connected:isConnected});
  const stopDailySummary = startDailySummaryWorker({ config, messages, connected: isConnected });
  setEventHandler(createDispatch({ config, messages }));
  const api = config.apiToken ? createApiServer({ config, messages }) : null;
  if (api) {
    api.listen(config.apiPort, "127.0.0.1", () => {
      process.stdout.write(`[qqbot] 后台消息接口 http://127.0.0.1:${config.apiPort}\n`);
    });
  }

  const wss = new WebSocketServer({ noServer: true });

  const server = http.createServer((req, res) => {
    // 只留一个健康检查，其余一律拒绝：这个端口的用途就是等 NapCat 连上来。
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ connected: isConnected(), connections: connectionCount() }));
      return;
    }
    res.writeHead(404).end();
  });

  server.on("upgrade", (req, socket, head) => {
    const remote = normalizeIp(req.socket.remoteAddress);
    if (!allowedSource(req.socket.remoteAddress)) {
      process.stderr.write(`[qqbot] 拒绝来自 ${remote} 的连接：不在 QQBOT_ALLOW_IPS 内\n`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    if (!authorized(req)) {
      process.stderr.write(`[qqbot] 拒绝来自 ${remote} 的连接：token 不匹配\n`);
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws, remote));
  });

  server.listen(config.port, config.host, () => {
    const source = config.allowIps.length ? config.allowIps.join(",") : isLoopback(config.host) ? "本机" : "不限";
    process.stdout.write(
      `[qqbot] 等待 NapCat 反向连接 ws://${config.host}:${config.port}｜来源 ${source}｜生效群 ${config.enabledGroups.join(",") || "未启用"}\n`,
    );
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopGoldenRooms();
      stopDailySummary();
      api?.close();
      for (const client of wss.clients) client.terminate();
      server.close(() => process.exit(0));
    });
  }

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startBot();
