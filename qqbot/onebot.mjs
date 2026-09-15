/**
 * OneBot v11 反向 WebSocket 的连接层：NapCat 主动连进来，事件上报与 API 调用共用同一条连接。
 * 这样 NapCat 那台机器不需要开任何入站端口，鉴权也收敛成握手时的一个 token。
 */
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";

/** 允许多条连接（NapCat 重连时新旧会短暂并存），发消息用最近活跃的那条。 */
const sockets = new Set();
/** echo -> resolve，等待 API 回执。 */
const pending = new Map();
let eventHandler = null;
let latest = null;

export function setEventHandler(handler) {
  eventHandler = handler;
}

export function isConnected() {
  return latest !== null && latest.readyState === 1;
}

export function connectionCount() {
  return sockets.size;
}

/** 接管一条新连接：分流 API 回执与事件上报，断开时清理。 */
export function attach(socket, remote) {
  sockets.add(socket);
  latest = socket;
  process.stdout.write(`[qqbot] NapCat 已连接（${remote}），当前连接数 ${sockets.size}\n`);

  socket.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    if (payload.echo !== undefined && pending.has(payload.echo)) {
      const entry = pending.get(payload.echo);
      pending.delete(payload.echo);
      clearTimeout(entry.timer);
      entry.resolve(payload);
      return;
    }
    if (payload.post_type) {
      latest = socket;
      Promise.resolve(eventHandler?.(payload)).catch((error) =>
        process.stderr.write(`[qqbot] 处理事件失败：${error.stack ?? error.message}\n`),
      );
    }
  });

  const drop = () => {
    sockets.delete(socket);
    if (latest === socket) latest = [...sockets].pop() ?? null;
    process.stdout.write(`[qqbot] NapCat 断开（${remote}），当前连接数 ${sockets.size}\n`);
  };
  socket.on("close", drop);
  socket.on("error", (error) => {
    process.stderr.write(`[qqbot] 连接异常（${remote}）：${error.message}\n`);
    drop();
  });
}

/** 调用一个 OneBot 动作并等回执。连接断开或超时都不抛出，避免中断流水线。 */
export function callAction(action, params) {
  return new Promise((resolve) => {
    if (!isConnected()) {
      process.stderr.write(`[qqbot] ${action} 失败：NapCat 未连接\n`);
      resolve(null);
      return;
    }
    const echo = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(echo);
      process.stderr.write(`[qqbot] ${action} 超时未回执\n`);
      resolve(null);
    }, 15_000);
    pending.set(echo, { resolve, timer });
    try {
      latest.send(JSON.stringify({ action, params, echo }));
    } catch (error) {
      pending.delete(echo);
      clearTimeout(timer);
      process.stderr.write(`[qqbot] ${action} 发送失败：${error.message}\n`);
      resolve(null);
    }
  });
}

/** 群消息有长度上限，超长时保留头部并标注截断。 */
function clamp(text) {
  const value = String(text ?? "").trim();
  if (value.length <= config.replyLimit) return value;
  return `${value.slice(0, config.replyLimit)}\n…（已截断，完整内容见任务日志）`;
}

/** 底层传输仅供消息服务使用；文本段防止用户内容被解释成 CQ 动作。 */
export async function sendGroupText(groupId, text) {
  return callAction("send_group_msg", {
    group_id: Number(groupId), message: [{ type: "text", data: { text: clamp(text) } }],
  });
}

/** 仅接收消息服务验证过的 PNG；Base64 兼容远端 NapCat。 */
export async function sendGroupImage(groupId, png) {
  return callAction("send_group_msg", {
    group_id: Number(groupId),
    message: [{ type: "image", data: { file: `base64://${png.toString("base64")}`, summary: "CN 金榜 · 在线玩家" } }],
  });
}

/** 合并转发只包含机器人自己的纯文本节点，保留明细，不套用普通消息截断。 */
export async function sendGroupForward(groupId, texts, selfId) {
  if (![groupId, selfId].every(id => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id)))
    || !Array.isArray(texts) || !texts.length || texts.some(text => typeof text !== 'string' || !text.trim())) throw new Error('合并转发参数无效');
  return callAction('send_group_forward_msg', {
    group_id: Number(groupId),
    messages: texts.map(text => ({ type: 'node', data: {
      user_id: Number(selfId), nickname: 'CN 金榜 · Std 审核',
      content: [{ type: 'text', data: { text } }],
    } })),
  });
}
