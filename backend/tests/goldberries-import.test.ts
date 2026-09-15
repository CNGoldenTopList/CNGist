import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import { importGoldberriesProposal, type GoldberriesPlan, type ImportedCovers } from "../src/modules/records/goldberries-import";
import type { Tx } from "../src/modules/admin/audit";
import { FC_TAG_COLOR } from "../../shared/src/review-tags";
import { checkDatabase } from "../scripts/db/check";

const proposal = { campaignName:"Pack",mapName:"Map",challengeName:"FC",gameBananaUrl:"https://gamebanana.com/mods/123" };
const plan: GoldberriesPlan = { submissionId:1,proposalTarget:proposal,...proposal,targetType:"C/FC",targetChallengeName:"C/FC",tier:"low-std",sourceUrl:"https://goldberries.net/challenge/12",sourceObjective:"Silver Berry",addFcTag:true };
const image = (key:string) => ({key,contentType:"image/png",bytes:100,source:"https://goldberries.net/image"});
const covers: ImportedCovers = { campaign:image("pack.png"),map:image("map.png") };
const actor = {displayName:"QQ 管理员 测试"};

async function fixture() {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL("../drizzle/0000_initial.sql",import.meta.url),"utf8"));
  const db = drizzle(pg,{schema});
  await pg.exec("INSERT INTO player(id,name) VALUES(1,'玩家');");
  await pg.query("INSERT INTO submission(id,player_id,proposed_target,video_url,raw_video_url,player_note) VALUES(1,1,$1,'https://example.test/video','https://example.test/raw','保留备注')",[JSON.stringify(proposal)]);
  return {pg,db,run:(p=plan,c=covers)=>db.transaction(tx=>importGoldberriesProposal(tx as unknown as Tx,p,c,actor))};
}

test("新挑战、封面索引、Std记录与FC标签原子写入；重复提案复用目录且保留同义标签",async()=>{
  const f=await fixture();
  try {
    const result=await f.run();assert.equal(result.status,"applied");
    const r=(await f.pg.query<any>("SELECT * FROM submission WHERE id=1")).rows[0];
    assert.equal(r.status,"accepted");assert.equal(r.proposed_target,null);assert.equal(r.reviewed_by,null);assert.equal(r.reviewed_at,null);
    assert.equal(r.video_url,"https://example.test/video");assert.equal(r.raw_video_url,"https://example.test/raw");assert.equal(r.player_note,"保留备注");
    assert.deepEqual((await f.pg.query("SELECT name,type,tier_code,scope FROM challenge")).rows,[{name:"C/FC",type:"C/FC",tier_code:"low-std",scope:"map"}]);
    assert.deepEqual((await f.pg.query("SELECT text,color FROM submission_tag")).rows,[{text:"FC",color:FC_TAG_COLOR}]);
    assert.equal((await f.pg.query("SELECT * FROM audit_log")).rows.length,1);
    assert.equal((await f.run()).status,"skipped");
    await f.pg.query("INSERT INTO submission(id,player_id,proposed_target) VALUES(2,1,$1)",[JSON.stringify(proposal)]);
    await f.pg.exec("INSERT INTO submission_tag(submission_id,kind,text,color) VALUES(2,'badge','moon','#123456'),(2,'mark','Hidden',null)");
    const again=await f.run({...plan,submissionId:2},{campaign:image('unused-pack.png'),map:image('unused-map.png')});
    assert.equal(again.status,"applied");if(again.status==='applied'){assert.deepEqual(again.created,{campaign:false,map:false,challenge:false});assert.equal(again.fcTagAdded,false);assert.deepEqual(again.usedKeys,[]);}
    assert.equal((await f.pg.query("SELECT * FROM challenge")).rows.length,1);
    assert.equal((await f.pg.query("SELECT * FROM image_asset")).rows.length,2);
    assert.deepEqual((await f.pg.query("SELECT kind,text,color FROM submission_tag WHERE submission_id=2 ORDER BY id")).rows,[{kind:'badge',text:'moon',color:'#123456'},{kind:'mark',text:'Hidden',color:null}]);
    assert.deepEqual(await checkDatabase(f.pg as never),{identityTables:true,references:true,dag:true});
  } finally {await f.pg.close();}
});

test("预演后提案变更、人工拒绝或玩家回收会跳过；图片索引失败整笔回滚",async()=>{
  const f=await fixture();
  try {
    await f.pg.query("UPDATE submission SET proposed_target=$1 WHERE id=1",[JSON.stringify({...proposal,mapName:'Changed'})]);
    assert.equal((await f.run()).status,'skipped');
    await f.pg.query("UPDATE submission SET proposed_target=$1,status='rejected' WHERE id=1",[JSON.stringify(proposal)]);
    assert.equal((await f.run()).status,'skipped');
    await f.pg.exec("UPDATE submission SET status='pending'; UPDATE player SET deleted_at=now()");
    assert.equal((await f.run()).status,'skipped');
    await f.pg.exec("UPDATE player SET deleted_at=null");
    await assert.rejects(f.run(plan,{campaign:image('valid.png'),map:{...image('bad.png'),bytes:0}}),/图片索引/);
    assert.equal((await f.pg.query("SELECT * FROM campaign")).rows.length,0);
    assert.equal((await f.pg.query("SELECT * FROM image_asset")).rows.length,0);
    assert.equal((await f.pg.query<any>("SELECT status FROM submission")).rows[0].status,'pending');
    assert.equal((await f.pg.query("SELECT * FROM audit_log")).rows.length,0);
  } finally {await f.pg.close();}
});

test("共用包封面只插入一份图片索引；正式 Tier 与回收目录不能被覆盖",async()=>{
  const f=await fixture();
  try {
    const same=image('same.png');const result=await f.run(plan,{campaign:same,map:same,fallback:true});
    assert.equal(result.status,'applied');assert.equal((await f.pg.query("SELECT * FROM image_asset")).rows.length,1);
    await f.pg.query("INSERT INTO submission(id,player_id,proposed_target) VALUES(2,1,$1)",[JSON.stringify(proposal)]);
    await f.pg.exec("UPDATE challenge SET tier_code='t7'");
    assert.equal((await f.run({...plan,submissionId:2})).status,'skipped');
    await f.pg.exec("UPDATE challenge SET tier_code='low-std'; UPDATE campaign SET deleted_at=now()");
    assert.equal((await f.run({...plan,submissionId:2})).status,'skipped');
    assert.equal((await f.pg.query<any>("SELECT status FROM submission WHERE id=2")).rows[0].status,'pending');
  } finally {await f.pg.close();}
});
