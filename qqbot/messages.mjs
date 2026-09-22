/** 普通指令与后台推送共用此服务，目标群在传输前统一校验。 */
import { config as runtimeConfig } from "./config.mjs";
import { sendGroupText, sendGroupImage, sendDailySummaryForward } from "./onebot.mjs";

export class MessageError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createMessageService({ config = runtimeConfig, transport = sendGroupText, imageTransport = sendGroupImage, summaryTransport = sendDailySummaryForward } = {}) {
  function validate(groupId, text, groups = config.enabledGroups) {
    const id = String(groupId ?? "");
    if (!groups.includes(id)) {
      throw new MessageError(403, "group_not_enabled", "目标群未启用");
    }
    if (typeof text !== "string" || !text.trim() || text.length > config.replyLimit) {
      throw new MessageError(400, "invalid_message", `消息须为 1–${config.replyLimit} 字符的非空文本`);
    }
    return id;
  }

  async function send(groupId, text) {
    const id = validate(groupId, text);
    return receipt(id, await transport(id, text));
  }

  async function sendPing(groupId, text) {
    const id = validate(groupId, text, config.pingGroups ?? []);
    return receipt(id, await transport(id, text));
  }

  function receipt(id, result) {
    if (!result) throw new MessageError(503, "delivery_unconfirmed", "NapCat 未连接或未确认发送结果");
    if (result.status !== "ok" || result.retcode !== 0) {
      throw new MessageError(502, "delivery_failed", "NapCat 拒绝发送消息");
    }
    return { groupId: id, messageId: result.data?.message_id ?? null };
  }

  async function push({ groupIds, text } = {}) {
    const targets = groupIds === undefined ? [...config.enabledGroups] : groupIds;
    if (!Array.isArray(targets) || !targets.length || targets.length > 100) {
      throw new MessageError(400, "invalid_groups", "必须指定 1–100 个生效群，或省略以推送到全部生效群");
    }
    // 先检查全部目标，避免遇到非法群号前已发送部分消息。
    const ids = [...new Set(targets.map((id) => validate(id, text)))];
    const results = [];
    for (const id of ids) {
      try {
        results.push({ ...(await send(id, text)), ok: true });
      } catch (error) {
        if (!(error instanceof MessageError)) throw error;
        results.push({ groupId: id, ok: false, code: error.code, error: error.message });
      }
    }
    return results;
  }

  async function sendImage(groupId, png) {
    const id = String(groupId ?? "");
    if (!config.enabledGroups.includes(id)) throw new MessageError(403, "group_not_enabled", "目标群未启用");
    if (!Buffer.isBuffer(png) || png.length < 8 || png.length > 2 * 1024 * 1024
      || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new MessageError(400, "invalid_image", "图片须为不超过 2 MiB 的 PNG");
    }
    return receipt(id, await imageTransport(id, png));
  }

  async function sendDailySummary(groupId, nodes) {
    const id = String(groupId ?? "");
    if (!(config.dailySummaryGroups ?? []).includes(id)) throw new MessageError(403, "group_not_enabled", "目标群未启用");
    if (!Array.isArray(nodes) || nodes.length < 2 || typeof nodes[0] !== "string" || typeof nodes.at(-1) !== "string") {
      throw new MessageError(400, "invalid_summary", "总结须包含开头和结尾文本");
    }
    for (const node of nodes) {
      if (typeof node === "string") validate(id, node, config.dailySummaryGroups);
      else if (!Buffer.isBuffer(node) || node.length < 8 || node.length > 2 * 1024 * 1024
        || !node.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new MessageError(400, "invalid_image", "图片须为不超过 2 MiB 的 PNG");
      }
    }
    return receipt(id, await summaryTransport(id, nodes));
  }

  return { send, sendPing, sendImage, sendDailySummary, push };
}
