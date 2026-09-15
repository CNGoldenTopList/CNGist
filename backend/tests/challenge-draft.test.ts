import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { Tx } from "../src/modules/admin/audit";
import { createChallengeDraft, proposalToken } from "../src/modules/records/challenge-draft";
import { previewGoldberries } from "../src/modules/records/goldberries-preview";
const p={campaignName:"Pack",mapName:"Unmatched map",challengeName:"C",suggestedTier:"mid-std"};
const source=[{id:1,name:"Pack",url:"https://gamebanana.com/mods/123",challenges:[],maps:[{id:2,campaign_id:1,name:"Source map",challenges:[]}]}];
test("部分匹配保留地图包、补全链接并提供可编辑申请资料；无缓存也返回预览",()=>{
  const preview=previewGoldberries(1,p,source);
  assert.equal(preview.draft.gameBananaUrl,source[0].url);
  assert.equal(preview.draft.mapName,p.mapName);
  assert.equal(preview.draft.tier,"mid-std");
  assert.deepEqual(preview.sourceMapNames,["Source map"]);
  assert.ok(preview.notes.length);
  assert.equal(previewGoldberries(1,p,[]).draft.challengeName,"C");
});
test("管理员补全可建立正式或未定档挑战且不审核记录；重复复用、变化和归属检查",async()=>{
  const pg=new PGlite();
  try{
    const folder=new URL('../drizzle/',import.meta.url);
    for(const f of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL(f,folder),'utf8'));
    const db=drizzle(pg,{schema});
    await pg.exec("INSERT INTO player(id,name) VALUES(1,'玩家');");
    await pg.query('INSERT INTO submission(id,player_id,proposed_target) VALUES(1,1,$1)',[JSON.stringify(p)]);
    const before=(await pg.query('SELECT * FROM submission')).rows;
    const draft={...previewGoldberries(1,p,source).draft,tier:'t7' as const,rules:'管理员补全的规则'};
    const run=(d=draft,token=proposalToken(p))=>db.transaction(tx=>createChallengeDraft(tx as unknown as Tx,{id:1,displayName:'管理员',role:'admin'},1,token,d));
    await assert.rejects(run({...draft,tier:null as never}),/难度/);
    const first=await run(),again=await run();
    assert.deepEqual(first,again);
    assert.deepEqual((await pg.query('SELECT * FROM submission')).rows,before);
    assert.equal((await pg.query('SELECT * FROM challenge')).rows.length,1);
    await assert.rejects(run(draft,'changed'),/已变化/);
    await assert.rejects(run({...draft,campaignId:first.campaignId,mapId:first.mapId+100}),/不属于/);
    await pg.exec('UPDATE campaign SET deleted_at=now()');
    await assert.rejects(run({...draft,campaignId:first.campaignId,mapId:first.mapId}),/已回收/);
    const replacement=await run(); assert.notEqual(replacement.campaignId,first.campaignId);
  }finally{await pg.close();}
});
