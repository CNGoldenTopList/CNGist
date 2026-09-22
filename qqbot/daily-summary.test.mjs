import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildDailySummaryNodes, createDailySummaryPoller } from "./daily-summary.mjs";
import { dailySummarySvg, renderDailySummaryImage } from "./daily-summary-image.mjs";
import { createMessageService } from "./messages.mjs";
const row = {id: 1, playerName: '<玩家>&"', mapId: 1, mapName: 'Map', campaignName: 'Pack', challengeName: 'FC', tier: 'h0', acceptedAt: '2026-09-22T01:00:00Z'};
const png = Buffer.from([137,80,78,71,13,10,26,10]);

test('消息顺序、所有图片、日期链接和 Std 尾句', async () => {
  const records = Array.from({length: 22}, (_,i) => ({...row,id:i,tier:i === 0 ? 'low-std' : 'h0'}));
  const calls = [];
  const nodes = await buildDailySummaryNodes({date:'2026-09-22',records,stdCount:1}, 'https://cngist.com', async(rows,meta) => { calls.push([rows.length,meta]); return png; });
  assert.equal(nodes[0], '2026-9-22 每日总结：');
  assert.deepEqual(calls.map(c => c[0]), [10,10,1]);
  assert.equal(nodes.length, 5);
  assert.match(nodes.at(-1), /还有 1 个 std 挑战未显示/);
  assert.match(nodes.at(-1), /https:\/\/cngist.com\/daily-summary\?date=2026-09-22/);
  const std = await buildDailySummaryNodes({date:'2026-09-22',records:[{...row,tier:'low-std'}],stdCount:1}, 'https://cngist.com', () => assert.fail());
  assert.equal(std.length, 2);
  const empty = await buildDailySummaryNodes({date:'2026-09-22',records:[],stdCount:0}, 'https://cngist.com', () => assert.fail());
  assert.match(empty[1], /暂无通过/);
});

test('独立群授权和图片验证，不能回退到 enabledGroups', async () => {
  const service = createMessageService({config:{dailySummaryGroups:['200'],enabledGroups:['100'],replyLimit:2000}, summaryTransport:async () => ({status:'ok',retcode:0,data:{message_id:9}})});
  assert.equal((await service.sendDailySummary('200',['开头',png,'结尾'])).messageId,9);
  await assert.rejects(service.sendDailySummary('100',['开头','结尾']), /目标群未启用/);
  await assert.rejects(service.sendDailySummary('200',['开头',Buffer.from('bad'),'结尾']), /PNG/);
  const off = createMessageService({config:{enabledGroups:['100'],replyLimit:2000}});
  await assert.rejects(off.sendDailySummary('100',['开头','结尾']), /目标群未启用/);
});

test('22:30 执行、断线补发、并发与重启幂等、失败群不重发', async () => {
  let clock = new Date('2026-09-22T14:29:59Z'), connected = true, builds = 0;
  const delivered = new Map(), sent = [], states = [];
  const store = {
    remaining:async(date,groups) => groups.filter(g => !delivered.has(`${date}/${g}`)),
    claim:async(date,group) => {const key = `${date}/${group}`; if(delivered.has(key)) return null; delivered.set(key,true); return key;},
    finish:async(id,status) => states.push([id,status]),
  };
  const options = {config:{dailySummaryGroups:['200','300'],enabledGroups:['999']},connected:()=>connected,now:()=>clock,store,log:()=>{},
    messages:{sendDailySummary:async(group) => {sent.push(group); if(group==='300') throw new Error('unknown'); return {messageId:9};}},
    fetchSummary:async()=>({}),buildNodes:async()=>{builds++;return ['开头','结尾'];}};
  const poll = createDailySummaryPoller(options);
  await poll(); assert.equal(sent.length,0);
  clock=new Date('2026-09-22T14:30:00Z'); connected=false; await poll(); assert.equal(builds,0);
  connected=true; await Promise.all([poll(),poll()]); assert.deepEqual(sent,['200','300']);
  assert.deepEqual(states.map(s=>s[1]),['sent','failed']);
  clock=new Date('2026-09-22T14:35:00Z'); await createDailySummaryPoller(options)(); assert.equal(sent.length,2);
  clock=new Date('2026-09-23T16:00:00Z'); await createDailySummaryPoller(options)(); assert.equal(sent.length,2);
  clock=new Date('2026-09-24T14:30:00Z'); await poll(); assert.equal(sent.length,4);
  const disabled = createDailySummaryPoller({...options,config:{enabledGroups:['999']},store:{remaining:()=>assert.fail()}}); await disabled();
});

test('接口准备失败可重试且不领取消息', async () => {
  let clock=new Date('2026-09-22T14:30:00Z'), attempts=0, claims=0;
  const poll=createDailySummaryPoller({config:{dailySummaryGroups:['200']},connected:()=>true,now:()=>clock,log:()=>{},
    store:{remaining:async()=>['200'],claim:async()=>{claims++;return 1;},finish:async()=>{}},
    messages:{sendDailySummary:async()=>({messageId:1})},
    fetchSummary:async()=>{if(++attempts===1)throw new Error('offline');return {};},buildNodes:async()=>['a','b']});
  await poll(); assert.equal(claims,0);
  clock=new Date('2026-09-22T14:31:00Z');await poll();assert.equal(claims,1);
});

test('SVG 安全转义、超长文本换行、10 条 PNG 可渲染、拒绝 Std', async () => {
  const rows=Array.from({length:10},(_,i)=>({...row,id:i,mapName:'地图'.repeat(2000),challengeName:'挑战'.repeat(2000)}));
  const meta={date:'2026-09-22',page:1,pages:1};
  const svg=await dailySummarySvg(rows,meta);
  assert.equal((svg.match(/data-record-id=/g)||[]).length,10);
  assert.match(svg,/&lt;玩家&gt;&amp;&quot;/);assert.match(svg,/…/);
  const result=await renderDailySummaryImage(rows,meta), metadata=await sharp(result).metadata();
  assert.equal(metadata.width,900);assert.ok(metadata.height<2500);assert.ok(result.length<2*1024*1024);
  await assert.rejects(dailySummarySvg([{...row,tier:'low-std'}],meta));
  await assert.rejects(dailySummarySvg([...rows,row],meta));
});
