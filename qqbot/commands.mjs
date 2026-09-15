/** 普通群指令分发；仅响应生效群。 */
import { config as runtimeConfig } from "./config.mjs";
import { createOnlineCommand } from "./online.mjs";

export function plainText(event) {
  if (Array.isArray(event.message)) {
    return event.message.filter((segment) => segment?.type === "text")
      .map((segment) => segment?.data?.text ?? "").join("").trim();
  }
  return String(event.raw_message ?? "")
    .replace(/\[CQ:[^\]]*\]/g, " ")
    .replace(/&#91;/g, "[").replace(/&#93;/g, "]")
    .replace(/&#44;/g, ",").replace(/&amp;/g, "&").trim();
}

export const publicCommands = new Map([
  ["/online", { description: "查看在线练习 / 带金图片；/online 2 翻页", run: createOnlineCommand({ url: runtimeConfig.onlineUrl, limit: runtimeConfig.replyLimit }) }],
  ["/help", { description: "查看普通用户指令", run: () => [...publicCommands].map(([name, entry]) => `${name}  ${entry.description}`).join("\n") }],
  ["/ping", { description: "检查机器人是否在线", run: () => "pong｜CN 金榜机器人在线" }],
]);

export function createDispatcher({ config, messages, commands = publicCommands, now = Date.now }) {
  // 每个群最多每两秒响应一条普通指令。
  const lastReply = new Map();
  return async function dispatch(event) {
    if (event?.post_type !== "message" || event.message_type !== "group") return;
    if (String(event.user_id) === String(event.self_id)) return;
    const groupId = String(event.group_id);
    const userId = String(event.user_id);
    if (!config.enabledGroups.includes(groupId)) return;
    const match = /^(\/[a-z]+)(?:\s+([\s\S]*))?$/i.exec(plainText(event));
    if (!match) return;
    const command = match[1].toLowerCase();
    const rest = (match[2] ?? "").trim();
    const handler = commands.get(command);
    if (!handler) return;
    const timestamp = now();
    if (timestamp - (lastReply.get(groupId) ?? -Infinity) < 2000) return;
    lastReply.set(groupId, timestamp);
    const reply = await handler.run({ groupId, userId, rest });
    for (const text of Array.isArray(reply) ? reply : [reply]) {
      if (text?.type === "image") await messages.sendImage(groupId, text.png);
      else if (text) await messages.send(groupId, text);
    }
  };
}
