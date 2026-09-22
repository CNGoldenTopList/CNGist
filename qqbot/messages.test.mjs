import test from "node:test";
import assert from "node:assert/strict";
import { createMessageService } from "./messages.mjs";

test("Ping 推送群独立授权，不会启用该群的普通消息或后台推送", async () => {
  const service = createMessageService({ config: {enabledGroups: ["100"], pingGroups: ["200"], replyLimit: 2000},
    transport: async () => ({status: "ok", retcode: 0, data: {message_id: 1}}) });
  assert.equal((await service.sendPing("200", "Ping")).groupId, "200");
  await assert.rejects(service.send("200", "regular"), /目标群未启用/);
  await assert.rejects(service.sendPing("100", "Ping"), /目标群未启用/);
});
