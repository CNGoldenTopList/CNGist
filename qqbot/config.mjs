/** QQ 机器人配置：使用根目录 config.json 作为唯一事实来源，缺关键项直接拒绝启动。 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 所有应用配置只从根目录 config.json 读取。 */
export const appConfig = JSON.parse(readFileSync(path.join(projectRoot, "config.json"), "utf8"));
const bot = appConfig.qqbot ?? {};

/** 逗号、中文逗号或空白分隔的列表，统一成字符串数组。 */
function list(value) {
  return (Array.isArray(value) ? value.join(",") : String(value ?? "")).split(/[,，\s]+/).filter(Boolean);
}

function int(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 回环监听不需要额外的网络防护；对外监听时 token 与来源 IP 是仅有的两道门。 */
export function isLoopback(host) {
  return ["127.0.0.1", "::1", "localhost"].includes(host);
}

export const config = {
  /** 反向 WebSocket 的监听地址。NapCat 同机时保持 127.0.0.1，跨机才改成 0.0.0.0。 */
  host: bot.host ?? "127.0.0.1",
  port: int(bot.port, 8269),
  /** NapCat 握手时带的 token，是这条连接唯一的身份凭证。 */
  accessToken: bot.accessToken ?? "",
  /** 普通指令生效群；空列表表示关闭，不继承管理员群。 */
  enabledGroups: [...new Set(list(bot.enabledGroups))],
  /** Ping 点主动推送群；独立于普通指令群，空列表关闭推送。 */
  pingGroups: [...new Set(list(bot.pingGroups))],
  /** 每日总结专属推送群；不继承其他群配置。 */
  dailySummaryGroups: [...new Set(list(bot.dailySummaryGroups))],
  dailySummaryUrl: bot.dailySummaryUrl ?? "http://127.0.0.1:8268/api/daily-summary",
  /** 后台服务接口固定监听回环，使用独立凭据；空 token 时不启动。 */
  apiToken: bot.apiToken ?? "",
  apiPort: int(bot.apiPort, 8270),
  /** 网站公开在线接口；同机默认直接走回环，无需后台推送 token。 */
  onlineUrl: bot.onlineUrl ?? "http://127.0.0.1:8268/api/online",
  /** 允许连入的来源 IP。跨机部署时必填，只放行 NapCat 那台。 */
  allowIps: list(bot.allowIps),
  /** 单条回群消息的截断长度。 */
  replyLimit: int(bot.replyLimit, 2000),
};

/** 校验连接凭据、生效群和监听地址。 */
export function assertConfig() {
  const missing = [];
  if (!config.accessToken) missing.push("QQBOT_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(`config.json 的 qqbot 缺少 ${missing.join("、")}，拒绝启动`);
  }
  for (const ids of [config.enabledGroups, config.pingGroups, config.dailySummaryGroups]) {
    if (ids.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
      throw new Error("QQBOT 的 QQ/群号列表必须是正整数，不能含无效或重复格式的 ID");
    }
  }
  if (config.apiToken && config.apiToken === config.accessToken) {
    throw new Error("QQBOT_API_TOKEN 必须与 QQBOT_ACCESS_TOKEN 不同");
  }
  if (!Number.isInteger(config.apiPort) || config.apiPort < 1 || config.apiPort > 65535 || config.apiPort === config.port) {
    throw new Error("QQBOT_API_PORT 必须是有效端口且不能与 QQBOT_PORT 相同");
  }
  // 对外监听时来源白名单不能省：token 一旦泄露，IP 限制是最后一道门。
  if (!isLoopback(config.host) && !config.allowIps.length) {
    throw new Error(`QQBOT_HOST=${config.host} 对外监听，必须用 QQBOT_ALLOW_IPS 指定 NapCat 所在机器的 IP，拒绝启动`);
  }
}
