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

test('合并转发一次发送全部节点，使用机器人身份和纯文本，不截断明细',async t=>{
  const {sendGroupForward}=await import('./onebot.mjs');
  const socket=new EventEmitter();socket.readyState=1;let calls=0;
  const texts=['Std 详情','[CQ:at,qq=all]\n'+ '明细'.repeat(4000)];
  socket.send=raw=>{calls++;const r=JSON.parse(raw);assert.equal(r.action,'send_group_forward_msg');assert.equal(r.params.group_id,200);assert.equal(r.params.messages.length,2);
    for(const [i,node] of r.params.messages.entries()){assert.equal(node.type,'node');assert.equal(node.data.user_id,99);assert.deepEqual(node.data.content,[{type:'text',data:{text:texts[i]}}]);}
    queueMicrotask(()=>socket.emit('message',JSON.stringify({echo:r.echo,status:'ok',retcode:0,data:{message_id:10}})));
  };
  attach(socket,'test-forward');t.after(()=>socket.emit('close'));
  assert.equal((await sendGroupForward('200',texts,'99')).data.message_id,10);assert.equal(calls,1);
  await assert.rejects(sendGroupForward('200',texts,'bad'),/参数无效/);
});
