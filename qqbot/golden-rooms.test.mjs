import test from "node:test";
import assert from "node:assert/strict";
import { createGoldenRoomPoller,formatGoldenRoomAlert } from "./golden-rooms.mjs";
const event={id:42,playerName:"玩家",campaignName:"包",mapName:"地图",roomName:"终点前",roomKey:"a",extraText:"冲！",bilibiliUid:"123"};
test("房间提醒附直播链接、追加文本；没有直播信息明确提示",()=>{
  assert.match(formatGoldenRoomAlert(event,"https://live.bilibili.com/42"),/https:\/\/live.bilibili.com\/42/);
  assert.match(formatGoldenRoomAlert(event,null),/暂未获取/);
  assert.ok(formatGoldenRoomAlert(event,null).endsWith("冲！"));
});
test("只推送到第一启用群，读取直播结果后发送；无群或断线不领取",async()=>{
  const sent=[];let claimed=0;
  const transaction=async work=>work({query:async sql=>{if(sql.startsWith("SELECT")){claimed++;return {rows:claimed===1?[event]:[]};}return {rows:[]};}});
  const options={config:{enabledGroups:["first","second"]},messages:{send:async(...args)=>sent.push(args)},connected:()=>true,transaction,liveCache:{read:()=>new Map([["123","https://live.bilibili.com/42"]])}};
  await createGoldenRoomPoller({...options,connected:()=>false})();
  await createGoldenRoomPoller({...options,config:{enabledGroups:[]}})();
  assert.equal(claimed,0);
  await createGoldenRoomPoller(options)();
  assert.equal(sent.length,1);assert.equal(sent[0][0],"first");assert.match(sent[0][1],/\/42/);
});


test("多个 ID 全部查询并按绑定顺序取首个开播直播间", async () => {
  const sent = []; let claimed = false;
  const transaction = async work => work({ query: async sql => {
    if (sql.startsWith("SELECT") && !claimed) { claimed = true; return { rows: [{ ...event, bilibiliUids: ["123", "456", "789"] }] }; }
    return { rows: [] };
  } });
  await createGoldenRoomPoller({ config: { enabledGroups: ["first"] }, connected: () => true, transaction,
    messages: { send: async (_, text) => sent.push(text) },
    liveCache: { read: uids => { assert.deepEqual(uids, ["123", "456", "789"]); return new Map([["789", "https://live.bilibili.com/3"], ["456", "https://live.bilibili.com/2"]]); } },
  })();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /https:\/\/live.bilibili.com\/2/);
});
