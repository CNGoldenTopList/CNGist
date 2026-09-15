import test from "node:test";
import assert from "node:assert/strict";
import { createDispatcher } from "./commands.mjs";
import { createMessageService } from "./messages.mjs";
import { createApiServer } from "./api.mjs";

const config = { enabledGroups: ["200", "300"], replyLimit: 2000, apiToken: "test-api-token" };
const event = (group, user, text) => ({ post_type: "message", message_type: "group", group_id: group, user_id: user, self_id: 999, message: [{ type: "text", data: { text } }] });

test("普通指令只响应生效群，忽略私聊、自身消息、未知指令，并按群限流", async () => {
  const replies = [];
  let time = 0;
  const dispatch = createDispatcher({ config, messages: { send: async (...args) => replies.push(args) }, now: () => time });
  await dispatch(event(100, 2, "/ping"));
  await dispatch(event(400, 1, "/ping"));
  await dispatch({ ...event(200, 2, "/ping"), message_type: "private" });
  await dispatch(event(200, 999, "/ping"));
  await dispatch(event(200, 2, "/unknown"));
  assert.equal(replies.length, 0);
  await dispatch(event(200, 2, "/ping"));
  await dispatch(event(200, 3, "/help"));
  assert.equal(replies.length, 1);
  time = 2000;
  await dispatch(event(200, 2, "/help"));
  assert.equal(replies.length, 2);
  assert.match(replies[1][1], /\/ping/);
  assert.doesNotMatch(replies[1][1], /\/fix/);
});

test("推送预检全部群号、去重、默认广播，空名单不发送", async () => {
  const sent = [];
  const transport = async (...args) => { sent.push(args); return { status: "ok", retcode: 0, data: { message_id: 42 } }; };
  const messages = createMessageService({ config, transport });
  await assert.rejects(messages.push({ groupIds: [200, 100], text: "hello" }), { code: "group_not_enabled" });
  assert.equal(sent.length, 0);
  const results = await messages.push({ groupIds: [200, "200"], text: "hello" });
  assert.equal(results.length, 1);
  assert.equal(results[0].messageId, 42);
  assert.equal((await messages.push({ text: "hello" })).length, 2);
  await assert.rejects(messages.send(200, " "), { code: "invalid_message" });
  await assert.rejects(messages.send(200, "a".repeat(2001)), { code: "invalid_message" });
  await assert.rejects(createMessageService({ config: { ...config, enabledGroups: [] }, transport }).push({ text: "hello" }), { code: "invalid_groups" });
});

test("发送失败与无回执不报告成功，也不会自动重试", async () => {
  let calls = 0;
  const messages = createMessageService({ config, transport: async () => (++calls === 1 ? null : { status: "failed", retcode: 100 }) });
  const results = await messages.push({ text: "hello" });
  assert.deepEqual(results.map((result) => result.code), ["delivery_unconfirmed", "delivery_failed"]);
  assert.equal(calls, 2);
});

test("HTTP 接口独立鉴权、校验目标与请求体、逐群回报结果", async (t) => {
  const sent = [];
  const messages = createMessageService({ config, transport: async (id) => { sent.push(id); return id === "200" ? { status: "ok", retcode: 0, data: { message_id: 7 } } : null; } });
  const server = createApiServer({ config, messages });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/v1/messages`;
  const request = (body, token = config.apiToken) => fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await request({ text: "hello" }, "onebot-token")).status, 401);
  assert.equal((await request({ text: "hello", groupIds: [100] })).status, 403);
  assert.equal((await request({ text: "hello", userId: "1" })).status, 400);
  assert.equal(sent.length, 0);
  const response = await request({ text: "hello" });
  assert.equal(response.status, 207);
  assert.deepEqual((await response.json()).results.map((result) => result.ok), [true, false]);
  assert.equal((await request({ text: "hello", groupIds: [200] })).status, 200);
});

test("图片发送校验群与 PNG，失败或未知回执只尝试一次", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let calls = 0;
  const messages = createMessageService({ config, imageTransport: async () => { calls++; return calls === 1 ? null : { status: "failed", retcode: 100 }; } });
  await assert.rejects(messages.sendImage(100, png), { code: "group_not_enabled" });
  await assert.rejects(messages.sendImage(200, Buffer.from("not png")), { code: "invalid_image" });
  await assert.rejects(messages.sendImage(200, Buffer.alloc(2 * 1024 * 1024 + 1)), { code: "invalid_image" });
  assert.equal(calls, 0);
  await assert.rejects(messages.sendImage(200, png), { code: "delivery_unconfirmed" });
  await assert.rejects(messages.sendImage(200, png), { code: "delivery_failed" });
  assert.equal(calls, 2);
  const success = createMessageService({ config, imageTransport: async () => ({ status: "ok", retcode: 0, data: { message_id: 8 } }) });
  assert.equal((await success.sendImage(200, png)).messageId, 8);
  await assert.rejects(success.push({ text: { type: "image", png } }), { code: "invalid_message" });
});

test("业务入口不提供个人运维命令", async () => {
  const replies = [];
  const dispatch = createDispatcher({ config, messages: { send: async (...args) => replies.push(args) } });
  for (const command of ["/fix", "/deploy", "/rollback", "/status"]) await dispatch(event(200, 1, command));
  assert.deepEqual(replies, []);
});
