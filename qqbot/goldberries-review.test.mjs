import test from 'node:test';
import assert from 'node:assert/strict';
import { compareProposal, gameBananaKey, formatDryRun } from './goldberries-review.mjs';
const proposal = { id: 1, proposed_target: { campaignName: 'Pack', mapName: 'Map', challengeName: 'C', gameBananaUrl: 'https://gamebanana.com/mods/123' } };
const challenge = { id: 9, map_id: 2, campaign_id: null, objective: { name: 'Golden Berry' }, difficulty: { name: 'Tier 1', sort: 1 }, requires_fc: false, has_fc: false };
const packs = c => [{ id: 3, name: 'Pack', url: proposal.proposed_target.gameBananaUrl, maps: [{ id: 2, name: 'Map', challenges: [c] }] }];
test('精确匹配类型，按 Tier 名称及排序映射 Std，不按 difficulty_id 猜测', () => {
  for (const [i,t] of ['low-std','mid-std','high-std'].entries()) assert.equal(compareProposal(proposal,packs({...challenge,difficulty:{name:`Tier ${i+1}`,sort:i+1},difficulty_id:999})).tier,t);
  for (const difficulty of [{name:'Tier 4',sort:4},{name:'Untiered',sort:0},{name:'Tier 1',sort:3}]) assert.equal(compareProposal(proposal,packs({...challenge,difficulty})).status,'manual');
});
test('附加规则、拒绝与归档不能被自动视为 C', () => {
  for (const patch of [{requires_fc:true},{label:'No DTS'},{description:'extra rule'},{is_rejected:true}]) assert.equal(compareProposal(proposal,packs({...challenge,...patch})).status,'manual');
  assert.equal(compareProposal({...proposal,proposed_target:{...proposal.proposed_target,rules:'No DTS'}},packs(challenge)).status,'manual');
  const c=packs(challenge);c[0].maps[0].is_archived=true;assert.equal(compareProposal(proposal,c).status,'manual');
});
test('地图包链接与地图名称必须唯一，不跨作用域或按单地图猜测', () => {
  assert.equal(gameBananaKey('https://evil.example/mods/123'),null);
  const c=packs(challenge);c[0].maps[0].name='Other';assert.equal(compareProposal(proposal,c).status,'manual');
  assert.equal(compareProposal(proposal,[...packs(challenge),...packs(challenge)]).status,'manual');
  assert.equal(compareProposal(proposal,packs({...challenge,map_id:null,campaign_id:3})).status,'manual');
});
test('结果按消息长度分页且不声称完成写入', () => {
  const report={total:80,candidates:0,manual:80,errors:0,items:Array.from({length:80},(_,i)=>({submissionId:i,mapName:'地图'.repeat(30),status:'manual',reason:'待确认'}))};
  const pages=formatDryRun(report);assert.ok(pages.length>1);assert.ok(pages.every(p=>p.length<=1600));assert.match(pages[0],/未建档、未审核、未上传/);
});

test('中文审核指令先鉴权；非管理员不查询数据，apply 参数不能触发写入', async () => {
  const { createReviewNewChallengesCommand } = await import('./goldberries-review.mjs');
  let runs = 0, applies = 0; const sent = [];
  const handler = createReviewNewChallengesCommand({ authorize: ({groupId,userId}) => groupId === '100' && userId === '1', send: async (...args) => sent.push(args), run: async () => { runs++; return {total:0,candidates:0,manual:0,errors:0,items:[]}; }, apply: async () => { applies++; return {items:[]}; } });
  const event = (group_id,user_id,raw_message='/审核新挑战') => ({post_type:'message',message_type:'group',self_id:999,group_id,user_id,raw_message});
  await handler(event(100,2));await handler(event(200,1));assert.equal(runs,0);assert.equal(sent.length,0);
  await handler(event(100,1,'/审核新挑战 apply'));assert.equal(runs,0);
  await handler(event(100,1,'/审核新挑战 dry-run'));assert.equal(runs,1);assert.equal(applies,0);assert.match(sent.at(-1)[1],/未建档、未审核、未上传/);
  await handler(event(100,1));assert.equal(applies,1);assert.match(sent.at(-1)[1],/新挑战审核完成/);
});

test('C/FC 按来源建档，只有 FC 提案的记录增加 FC 标签；银莓也纳入', () => {
  for (const name of ['Golden Berry','Silver Berry']) {
    for (const variant of ['C','FC','C/FC']) {
      const result=compareProposal({...proposal,proposed_target:{...proposal.proposed_target,challengeName:variant}},packs({...challenge,has_fc:true,objective:{name}}));
      assert.equal(result.status,'candidate');assert.equal(result.targetType,'C/FC');assert.equal(result.targetChallengeName,'C/FC');assert.equal(result.addFcTag,variant==='FC');assert.equal(result.sourceObjective,name);
    }
  }
  assert.equal(compareProposal(proposal,packs({...challenge,objective:{name:'Silver Berry'}})).status,'candidate');
});
test('只对明确缺失的地图封面复用地图包；网络故障不能被当成缺图', async () => {
  const {checkProposalCovers}=await import('./goldberries-review.mjs');
  const covers={campaign:'pack',map:'map'};
  const result=await checkProposalCovers(covers,async url=>{if(url==='map')throw Object.assign(new Error('missing'),{code:'missing_cover'});return {url,bytes:100};});
  assert.equal(result.map.url,'pack');assert.equal(result.map.fallback,'campaign');
  await assert.rejects(checkProposalCovers(covers,async url=>{if(url==='map')throw new Error('timeout');return {url};}),/timeout/);
});
