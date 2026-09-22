import test from "node:test";
import assert from "node:assert/strict";
import { createGoldenRoomPoller,formatGoldenRoomAlert } from "./golden-rooms.mjs";
const event={id:42,playerName:"玩家",campaignName:"包",mapName:"地图",roomName:"终点前",roomKey:"a",extraText:"冲！",bilibiliUid:"123"};
test("房间提醒附直播链接、追加文本；没有直播信息明确提示",()=>{
  assert.match(formatGoldenRoomAlert(event,"https://live.bilibili.com/42"),/https:\/\/live.bilibili.com\/42/);
  assert.match(formatGoldenRoomAlert(event,null),/暂未获取/);
  assert.ok(formatGoldenRoomAlert(event,null).endsWith("冲！"));
});
test("推送到全部独立配置群，读取直播结果后发送；无群或断线不领取",async()=>{
  const sent=[];let claimed=0;
  const transaction=async work=>work({query:async sql=>{if(sql.startsWith("SELECT")){claimed++;return {rows:claimed===1?[event]:[]};}return {rows:[]};}});
  const options={config:{pingGroups:["first","second"]},messages:{sendPing:async(...args)=>sent.push(args)},connected:()=>true,transaction,liveCache:{read:()=>new Map([["123","https://live.bilibili.com/42"]])}};
  await createGoldenRoomPoller({...options,connected:()=>false})();
  await createGoldenRoomPoller({...options,config:{pingGroups:[]}})();
  assert.equal(claimed,0);
  await createGoldenRoomPoller(options)();
  assert.equal(sent.length,2);assert.equal(sent[1][0],"second");assert.equal(sent[0][0],"first");assert.match(sent[0][1],/\/42/);
});


test("多个 ID 全部查询并按绑定顺序取首个开播直播间", async () => {
  const sent = []; let claimed = false;
  const transaction = async work => work({ query: async sql => {
    if (sql.startsWith("SELECT") && !claimed) { claimed = true; return { rows: [{ ...event, bilibiliUids: ["123", "456", "789"] }] }; }
    return { rows: [] };
  } });
  await createGoldenRoomPoller({ config: { pingGroups: ["first"] }, connected: () => true, transaction,
    messages: { sendPing: async (_, text) => sent.push(text) },
    liveCache: { read: uids => { assert.deepEqual(uids, ["123", "456", "789"]); return new Map([["789", "https://live.bilibili.com/3"], ["456", "https://live.bilibili.com/2"]]); } },
  })();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /https:\/\/live.bilibili.com\/2/);
});

test("单群发送失败仍尝试其余推送群，失败事件不重发", async () => {
  let claimed = false; const sent = []; const statuses = [];
  const transaction = async work => work({query: async (sql) => {
    if (sql.startsWith("SELECT") && !claimed) { claimed = true; return { rows: [event] }; }
    if (sql.startsWith("UPDATE")) statuses.push(sql);
    return { rows: [] };
  }});
  await createGoldenRoomPoller({config: {enabledGroups: [], pingGroups: ["a", "b"]}, connected: () => true, transaction,
    liveCache: {read: () => new Map()}, messages: {sendPing: async group => {sent.push(group); if (group === "a") throw new Error("offline");}}})();
  assert.deepEqual(sent, ["a", "b"]);
  assert.ok(statuses.some(sql => sql.includes("status='failed'")));
});

 test("房间使用路线位置与总数，没有可用路线时只显示 key", () => {
  assert.match(formatGoldenRoomAlert({...event,position:5,routeLength:10},null), /房间：5 \/ 10 （a）/);
  for (const progress of [{}, {position:null,routeLength:null}, {position:0,routeLength:10}, {position:11,routeLength:10}]) {
    const text = formatGoldenRoomAlert({...event,...progress},null);
    assert.match(text, /房间：a\n/);
    assert.ok(!text.includes("终点前"));
  }
});
