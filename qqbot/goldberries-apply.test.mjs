import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOneProposal, formatApplyReport } from './goldberries-apply.mjs';
const item={submissionId:1,covers:{campaign:'pack',map:'map'}};
function fixture() {
  const removed=[];let commits=0,uploads=0;
  return {removed,get commits(){return commits;},get uploads(){return uploads;},deps:{
    authorize:async()=>true,
    readCover:async url=>({url,buffer:Buffer.from(url)}),
    upload:async()=>({key:`image-${++uploads}`,contentType:'image/png',bytes:4}),
    remove:async key=>removed.push(key),
    commit:async()=>{commits++;return {status:'applied',usedKeys:['image-1','image-2']};},
  }};
}
test('上传失败不写数据库，清理已上传对象；权限失效不上传',async()=>{
  const f=fixture();let n=0;
  f.deps.upload=async()=>{if(++n===2)throw new Error('upload failed');return {key:'first'};};
  const r=await applyOneProposal(item,f.deps);assert.equal(r.status,'error');assert.equal(f.commits,0);assert.deepEqual(f.removed,['first']);
  const blocked=fixture();blocked.deps.authorize=async()=>false;assert.equal((await applyOneProposal(item,blocked.deps)).status,'skipped');assert.equal(blocked.uploads,0);
});
test('提交结果未确认时保留上传对象；确认跳过时清理未引用对象',async()=>{
  const f=fixture();f.deps.commit=async()=>{throw new Error('connection lost');};
  const r=await applyOneProposal(item,f.deps);assert.equal(r.commitUncertain,true);assert.deepEqual(f.removed,[]);assert.deepEqual(r.retainedUploads,['image-1','image-2']);
  const skipped=fixture();skipped.deps.commit=async()=>({status:'skipped',reason:'already handled'});
  assert.equal((await applyOneProposal(item,skipped.deps)).status,'skipped');assert.deepEqual(skipped.removed,['image-1','image-2']);
});
test('缺失地图封面时复用包图，同内容只上传一次',async()=>{
  const f=fixture();f.deps.readCover=async url=>{if(url==='map')throw Object.assign(new Error('missing'),{code:'missing_cover'});return {url,buffer:Buffer.from('same')};};
  f.deps.commit=async(_,covers)=>{assert.equal(covers.campaign.key,covers.map.key);assert.equal(covers.fallback,true);return {status:'applied',usedKeys:[covers.map.key]};};
  assert.equal((await applyOneProposal(item,f.deps)).status,'applied');assert.equal(f.uploads,1);assert.deepEqual(f.removed,[]);
});
test('正式结果不把部分失败报告为完全成功',()=>{
  const pages=formatApplyReport({items:[{submissionId:1,mapName:'Map',status:'error',reason:'lost',commitUncertain:true,retainedUploads:['x']}]});
  assert.match(pages[0],/失败\/待核对 1/);assert.match(pages[0],/提交状态需核对/);assert.match(pages[0],/保留待核对/);
});
