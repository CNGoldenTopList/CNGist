import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attach, sendGroupImage } from "./onebot.mjs";

test("图片经 OneBot image 段发送，Base64 原样传输并等待回执", async (t) => {
  const socket = new EventEmitter();
  socket.readyState = 1;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  socket.send = raw => {
    const request = JSON.parse(raw);
    assert.equal(request.action, "send_group_msg");
    assert.equal(request.params.group_id, 200);
    const [segment] = request.params.message;
    assert.equal(segment.type, "image");
    assert.deepEqual(Buffer.from(segment.data.file.slice("base64://".length), "base64"), png);
    queueMicrotask(() => socket.emit("message", JSON.stringify({ echo: request.echo, status: "ok", retcode: 0, data: { message_id: 9 } })));
  };
  attach(socket, "test");
  t.after(() => socket.emit("close"));
  assert.equal((await sendGroupImage("200", png)).data.message_id, 9);
});
