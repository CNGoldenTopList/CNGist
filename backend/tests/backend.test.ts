/** 只验证重构最容易破坏的权限、事务、投影与同步边界。 */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import * as s from "../src/db/schema";
import { buildApp } from "../src/app";
import { routes } from "../src/routes";
import { getConfig } from "../src/config";
import { checkDatabase } from "../scripts/db/check";
import { hashPassword } from "../src/modules/auth/password";
import { ensureDag } from "../../shared/src/challenge-graph";
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: number, owner: number, outsider: number, player: number, otherPlayer: number;
let adminCookie: string, ownerCookie: string, outsiderCookie: string;
let campaign: number, map: number, base: number, strict: number, combined: number, multi: number;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function session(accountId: number) {
  const token = randomUUID();
  await db.insert(s.session).values({ accountId, tokenHash: hash(token), amr: ["pwd"], expiresAt: new Date(Date.now()+86400000) });
  return `cngist_session=${token}`;
}
before(async () => {
  assert.match(new URL(getConfig().database.url).pathname, /cngist_refactor_(check|test)_/, "测试只允许专用临时数据库");
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'tier'");
  await pool.query(`TRUNCATE ${tables.rows.map(r => '"'+r.tablename+'"').join(',')} RESTART IDENTITY CASCADE`);
  [player,otherPlayer] = (await db.insert(s.player).values([{name:"验证玩家甲"},{name:"验证玩家乙"}]).returning()).map(r=>r.id);
  [admin,owner,outsider] = (await db.insert(s.account).values([
    {displayName:"验证管理员",role:"super_admin",email:"admin@example.test"},
    {displayName:"验证玩家甲",claimedPlayerId:player,email:"player@example.test"},
    {displayName:"验证玩家乙",claimedPlayerId:otherPlayer},
  ]).returning()).map(r=>r.id);
  await db.insert(s.authIdentity).values({accountId:owner,provider:"password",subject:"player@example.test",secret:await hashPassword("valid-password-123")});
  adminCookie=await session(admin);ownerCookie=await session(owner);outsiderCookie=await session(outsider);
  campaign=(await db.insert(s.campaign).values({name:"Test Pack",shortName:"Test Pack"}).returning())[0].id;
  map=(await db.insert(s.map).values({campaignId:campaign,name:"Test Map"}).returning())[0].id;
  [base,strict,combined,multi]=(await db.insert(s.challenge).values([
    {scope:"map",mapId:map,name:"Test C",type:"C",tierCode:"t7"},
    {scope:"map",mapId:map,name:"Test [No DTS] FC",type:"FC",tierCode:"t7"},
    {scope:"map",mapId:map,name:"Test Std C/FC",type:"C/FC",tierCode:"mid-std"},
    {scope:"campaign",campaignId:campaign,name:"All Maps C/FC",type:"C/FC",tierCode:"t6"},
  ]).returning()).map(r=>r.id);
  app=await buildApp();
});
after(async()=>{await app?.close();await pool.end();});
const req = (method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", url: string, cookie?: string, payload?: unknown) => app.inject({method,url,headers:cookie?{cookie}:{},...(payload===undefined?{}:{payload:payload as object})});

test("新库所有表为自增数字主键，迁移与引用约束完整",async()=>{
  assert.deepEqual(await checkDatabase(pool),{identityTables:true,references:true,dag:true});
  await assert.rejects(db.insert(s.challenge).values({scope:"map",mapId:map,campaignId:campaign,name:"Invalid"}));
  assert.equal(ensureDag([base,strict],[{from:base,to:strict},{from:strict,to:base}]).length,1);
});

test("原有路由全部可调用；公开查询与管理读取独立运行",async()=>{
  for(const route of routes.filter(r=>r.method==="GET" && !r.url.includes(":") && !r.url.startsWith("/api/auth/login"))){
    const response=await req("GET",route.url,adminCookie);
    assert.ok(response.statusCode<500,`${route.url}: ${response.statusCode} ${response.body}`);
  }
  const packs=await req("GET","/api/campaigns");assert.equal(packs.json().campaigns[0].id,campaign);
  const details=await req("GET",`/api/challenges/${multi}`);assert.equal(details.json().scope,"campaign");
});

test("数字 ID 不授予权限；会话隔离、撤权和登录 Cookie 有效",async()=>{
  const denied=await req("POST","/api/admin/catalog/batch",ownerCookie,{operations:[],accountId:admin,role:"super_admin"});assert.equal(denied.statusCode,403);
  const login=await req("POST","/api/auth/login",undefined,{email:"player@example.test",password:"valid-password-123"});
  assert.equal(login.statusCode,200,login.body);assert.match(String(login.headers["set-cookie"]),/HttpOnly/i);
  const results=await Promise.all(Array.from({length:16},(_,i)=>req("GET","/api/auth/session",i%2?ownerCookie:outsiderCookie)));
  results.forEach((r,i)=>assert.equal(r.json().account.id,i%2?owner:outsider));
  await db.update(s.account).set({role:"player"}).where(eq(s.account.id,admin));
  assert.equal((await req("GET","/api/admin/accounts",adminCookie)).statusCode,403);
  await db.update(s.account).set({role:"super_admin"}).where(eq(s.account.id,admin));
  const csrf=await app.inject({method:"POST",url:"/api/auth/logout",headers:{cookie:ownerCookie,origin:"https://invalid.example"}});assert.equal(csrf.statusCode,403);
});

test("批量目录默认预览、失败整批回滚、跨操作引用及部分修改",async()=>{
  const operations=[{action:"create",kind:"campaign",ref:"pack",data:{name:"Batch Pack"}},{action:"create",kind:"map",ref:"map",data:{name:"Batch Map",campaignId:"$pack"}},{action:"create",kind:"challenge",data:{name:"Batch C",scope:"map",mapId:"$map",tier:"t7",type:"C"}}];
  const preview=await req("POST","/api/admin/catalog/batch",adminCookie,{operations});assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().data.dryRun,true);
  assert.equal((await db.select().from(s.campaign).where(eq(s.campaign.name,"Batch Pack"))).length,0);
  const bad=await req("POST","/api/admin/catalog/batch",adminCookie,{dryRun:false,operations:[...operations,{action:"create",kind:"challenge",data:{name:"Bad",scope:"map",mapId:"$map",tier:"invalid"}}]});assert.equal(bad.statusCode,400,bad.body);
  assert.equal((await db.select().from(s.campaign).where(eq(s.campaign.name,"Batch Pack"))).length,0);
  const good=await req("POST","/api/admin/catalog/batch",adminCookie,{dryRun:false,operations});assert.equal(good.statusCode,200,good.body);
  const id=good.json().data.results[1].id;assert.equal(typeof id,"number");
  const patch=await req("POST","/api/admin/catalog/batch",adminCookie,{dryRun:false,operations:[{action:"update",kind:"map",id,data:{cnName:"用户提供的中文名"}}]});assert.equal(patch.statusCode,200,patch.body);
  const row=(await db.select().from(s.map).where(eq(s.map.id,id)))[0];assert.equal(row.name,"Batch Map");assert.equal(row.cnName,"用户提供的中文名");
});

test("公开投影覆盖 DAG 继承、RAW、FC 同义标签、隐藏与软删除恢复",async()=>{
  await db.insert(s.challengeRelationOverride).values({mapId:map});await db.insert(s.challengeRelation).values({fromId:base,toId:strict});
  const [a,b,c]=await db.insert(s.submission).values([
    {playerId:player,challengeId:base,status:"accepted",achievedAt:"2025-01-01"},
    {playerId:player,challengeId:strict,status:"accepted",achievedAt:"2025-02-01",recommends:true,opinionTier:"t7"},
    {playerId:player,challengeId:strict,status:"accepted",achievedAt:"2025-03-01"},
  ]).returning();
  await db.insert(s.submissionTag).values(["RAW","月莓","FC","moon"].map(text=>({submissionId:b.id,kind:"badge",text})));
  const projected=(await req("GET",`/api/challenges/${base}`)).json();assert.equal(projected.clearCount,1);
  const strictPage=(await req("GET",`/api/challenges/${strict}`)).json();assert.equal(strictPage.records.length,2);assert.deepEqual(strictPage.records.find((r:any)=>r.id===b.id).tags,["月莓"]);
  let profile=(await req("GET",`/api/players/${player}`)).json();assert.deepEqual(profile.records.map((r:any)=>r.id),[c.id]);
  await db.update(s.submission).set({status:"hidden"}).where(eq(s.submission.id,b.id));await db.update(s.submission).set({deletedAt:new Date()}).where(eq(s.submission.id,c.id));
  profile=(await req("GET",`/api/players/${player}`)).json();assert.deepEqual(profile.records.map((r:any)=>r.id),[a.id]);
  await db.update(s.player).set({deletedAt:new Date()}).where(eq(s.player.id,player));assert.equal((await req("GET",`/api/challenges/${base}`)).json().clearCount,0);
  await db.update(s.player).set({deletedAt:null}).where(eq(s.player.id,player));assert.equal((await req("GET",`/api/challenges/${base}`)).json().clearCount,1);
  const [tag]=await db.insert(s.submissionTag).values({submissionId:a.id,kind:"badge",text:"Hidden"}).returning();
  const catalog=(await req("GET","/api/catalog")).json();assert.equal(catalog.submissions.length,0);assert.equal(catalog.campaigns[0].goldenedCount,0);
  await db.delete(s.submissionTag).where(eq(s.submissionTag.id,tag.id));
});

test("Std 提交身份来自会话；愿望单数字 ID 和本人编辑有效",async()=>{
  const response=await req("POST","/api/submissions",ownerCookie,{kind:"run",challengeId:combined,playerId:otherPlayer,accountId:outsider,addFc:true,videoUrl:"https://example.test/video",achievedAt:"2026-09-15"});assert.equal(response.statusCode,201,response.body);
  const record=response.json().record;assert.equal(record.playerId,player);assert.equal(record.status,"accepted");
  assert.equal((await req("PATCH",`/api/submissions/${record.id}`,outsiderCookie,{playerNote:"spoof",videoUrl:"https://example.test/video",achievedAt:"2026-09-15"})).statusCode,403);
  const wish=await req("POST","/api/wishlist",ownerCookie,{challengeId:combined});assert.equal(wish.statusCode,201,wish.body);
  const update=await req("PATCH","/api/wishlist",ownerCookie,{id:wish.json().entry.id,progress:35});assert.equal(update.statusCode,200,update.body);assert.equal(update.json().entry.progress,35);
});

test("设备令牌仍可用，数字外键同步正常；重复心跳与撤销受保护",async()=>{
  const token=randomUUID();await db.insert(s.trackerCctStorage).values({accountId:owner,enabled:true});
  const device=(await db.insert(s.trackerDevice).values({accountId:owner,name:"Test Mod",tokenHash:hash(token)}).returning())[0];
  const deviceReq=(method:"GET"|"POST",url:string,payload?:object)=>app.inject({method,url,headers:{authorization:`Bearer ${token}`},...(payload?{payload}:{})});
  const config=await deviceReq("GET","/api/tracker/config");assert.equal(config.statusCode,200,config.body);assert.equal(config.json().deviceId,device.externalId);
  const scope={datasetId:randomUUID(),sid:"Test/SID",side:"Normal",segmentKey:"all"};
  const baseline={scope,mutationId:randomUUID(),streamEpoch:randomUUID(),revision:1,expected:null,state:{metadata:{cctVersion:"2.10.2",adapterVersion:"local-cct-state/1",cctSessionKey:"s1",settings:{trackNegativeStreaks:true,selectedAttemptCount:20},chapter:{goldenCollectedCount:0,goldenCollectedCountSession:0},route:null},rooms:[{roomKey:"a",previousAttempts:[true,false],successStreak:0,successStreakBest:1,goldenBerryDeaths:0,goldenBerryDeathsSession:0,deathsInCurrentRun:0}]}};
  const synced=await deviceReq("POST","/api/tracker/cct/baseline",baseline);assert.equal(synced.statusCode,200,synced.body);
  assert.equal((await deviceReq("POST","/api/tracker/cct/baseline",baseline)).json().duplicate,true);
  const [storedScope]=await db.select().from(s.trackerCctScope);const [storedRoom]=await db.select().from(s.trackerCctRoom);assert.equal(storedScope.deviceId,device.id);assert.equal(storedRoom.scopeId,storedScope.id);assert.equal(typeof storedRoom.id,"number");
  const start=await deviceReq("POST","/api/tracker/presence",{action:"start",accountId:outsider,deviceId:999});assert.equal(start.statusCode,200,start.body);
  const input={action:"snapshot",connectionId:start.json().connectionId,sequence:1,transitions:[],observation:{sid:"Test/SID",side:"Normal",room:"a",paused:false,transitioning:false,holdingGolden:false,cctAvailable:false,cctTrackingPaused:null}};
  assert.equal((await deviceReq("POST","/api/tracker/presence",input)).statusCode,200);assert.equal((await deviceReq("POST","/api/tracker/presence",input)).statusCode,200);
  const row=(await db.select().from(s.trackerPresence))[0];assert.equal(row.accountId,owner);assert.equal(row.deviceId,device.id);assert.equal(typeof row.id,"number");
  await db.update(s.account).set({status:"disabled"}).where(eq(s.account.id,owner));assert.equal((await deviceReq("GET","/api/tracker/config")).statusCode,401);assert.equal((await req("GET","/api/auth/session",ownerCookie)).json().account,null);
  await db.update(s.account).set({status:"active"}).where(eq(s.account.id,owner));
  await db.update(s.trackerDevice).set({revokedAt:new Date()}).where(eq(s.trackerDevice.id,device.id));assert.equal((await deviceReq("GET","/api/tracker/config")).statusCode,401);
});


test("记录 verified：审核入口、Std 提案、升降档、批量回滚与客户端伪造",async()=>{
  const [target]=(await db.insert(s.challenge).values({scope:"campaign",campaignId:campaign,name:"Verification",tierCode:"low-std"}).returning());
  const input={challengeId:target.id,videoUrl:"https://example.test/verified",achievedAt:"2026-09-15",verified:true};
  const submitted=await req("POST","/api/submissions",ownerCookie,input);
  assert.equal(submitted.statusCode,201,submitted.body);
  const id=submitted.json().record.id;
  const row=async(recordId=id)=>(await db.select().from(s.submission).where(eq(s.submission.id,recordId)))[0];
  assert.equal(submitted.json().record.verified,false);
  await req("PATCH",`/api/admin/submissions/${id}`,adminCookie,{verified:true});
  assert.equal((await row()).verified,false);
  assert.equal((await req("POST",`/api/admin/submissions/${id}/review`,ownerCookie,{status:"accepted"})).statusCode,403);
  assert.equal((await req("POST",`/api/admin/submissions/${id}/review`,adminCookie,{status:"accepted"})).statusCode,200);
  assert.equal((await row()).verified,false);
  const proposal=await req("POST","/api/submissions",ownerCookie,{kind:"challenge",videoUrl:input.videoUrl,achievedAt:input.achievedAt,proposedTarget:{campaignName:"Pack",mapName:"Map",challengeName:"New",gameBananaUrl:"https://gamebanana.com/mods/123"}});
  assert.equal(proposal.statusCode,201,proposal.body);
  const proposalId=proposal.json().record.id;
  assert.equal((await req("POST",`/api/admin/submissions/${proposalId}/review`,adminCookie,{status:"accepted",challengeId:target.id})).statusCode,200);
  assert.equal((await row(proposalId)).verified,false);
  const [hidden,deleted,verified]=await db.insert(s.submission).values([
    {challengeId:target.id,playerId:player,status:"hidden"},
    {challengeId:target.id,playerId:player,status:"accepted",deletedAt:new Date()},
    {challengeId:target.id,playerId:player,status:"accepted",verified:true,reviewedBy:admin,reviewedAt:new Date()},
  ]).returning();
  await db.insert(s.submissionTag).values({submissionId:hidden.id,kind:"badge",text:"Hidden"});
  const change=(tier:string)=>req("PUT","/api/admin/catalog",adminCookie,{kind:"challenge",id:target.id,name:target.name,tier});
  const batch=(dryRun:boolean,extra:object[]=[])=>req("POST","/api/admin/catalog/batch",adminCookie,{dryRun,operations:[{kind:"challenge",action:"update",id:target.id,data:{tier:"t7"}},...extra]});
  assert.equal((await batch(true)).statusCode,200);assert.equal((await row()).status,"accepted");
  assert.equal((await batch(false,[{kind:"challenge",action:"update",id:target.id,data:{tier:"bad"}}])).statusCode,400);
  assert.equal((await row()).status,"accepted");
  assert.equal((await change("t7")).statusCode,200);
  for(const recordId of [id,proposalId,hidden.id,deleted.id]) assert.equal((await row(recordId)).status,"pending");
  assert.ok((await row(deleted.id)).deletedAt);assert.equal((await row(verified.id)).status,"accepted");
  assert.deepEqual((await req("GET",`/api/challenges/${target.id}`)).json().records.map((r:any)=>r.id),[verified.id]);
  assert.equal((await req("POST",`/api/admin/submissions/${id}/review`,adminCookie,{status:"accepted"})).statusCode,200);
  assert.equal((await row()).verified,true);
  assert.equal((await req("PATCH",`/api/admin/submissions/${proposalId}`,adminCookie,{status:"accepted"})).statusCode,200);
  assert.equal((await row(proposalId)).verified,true);
  const historical=await row();
  assert.equal((await change("mid-std")).statusCode,200);assert.equal((await row()).verified,true);
  const extra=await req("POST","/api/admin/submissions",adminCookie,{...input,playerId:player,status:"accepted"});
  assert.equal(extra.statusCode,201,extra.body);assert.equal(extra.json().record.verified,false);
  assert.equal((await batch(false)).statusCode,200);
  assert.equal((await row(extra.json().record.id)).status,"pending");
  assert.equal((await row()).status,"accepted");assert.deepEqual((await row()).reviewedAt,historical.reviewedAt);
  const direct=await req("POST","/api/admin/submissions",adminCookie,{...input,playerId:player,status:"accepted"});
  assert.equal(direct.statusCode,201,direct.body);assert.equal(direct.json().record.verified,true);
  const records=(await req("GET",`/api/challenges/${target.id}`)).json().records;
  assert.ok(records.every((r:any)=>r.verified));
  assert.equal(records.some((r:any)=>r.id===hidden.id||r.id===deleted.id),false);
  await req("POST",`/api/admin/submissions/${id}/review`,adminCookie,{status:"rejected"});
  const resubmitted=await req("PATCH",`/api/submissions/${id}`,ownerCookie,input);
  assert.equal(resubmitted.statusCode,200,resubmitted.body);
  assert.equal((await row()).verified,false);assert.equal((await row()).status,"pending");
});


test("拆分和合并 Std 到 Tier 时按记录 verified 重审，保留回收记录",async()=>{
  const [source]=await db.insert(s.challenge).values({scope:"map",mapId:map,name:"Split verification",tierCode:"low-std"}).returning();
  const [first,second,verified,deleted]=await db.insert(s.submission).values([
    {challengeId:source.id,playerId:player,status:"accepted"},
    {challengeId:source.id,playerId:otherPlayer,status:"accepted"},
    {challengeId:source.id,playerId:player,status:"accepted",verified:true},
    {challengeId:source.id,playerId:player,status:"accepted",deletedAt:new Date()},
  ]).returning();
  const split=await req("POST",`/api/admin/challenges/${source.id}/split`,adminCookie,{first:{name:"Split Tier",tier:"t7"},second:{name:"Split Std",tier:"mid-std"},selected:[second.id]});
  assert.equal(split.statusCode,200,split.body);
  const targets=split.json().data;
  const row=async(id:number)=>(await db.select().from(s.submission).where(eq(s.submission.id,id)))[0];
  assert.equal((await row(first.id)).status,"pending");assert.equal((await row(first.id)).challengeId,targets.first);
  assert.equal((await row(verified.id)).status,"accepted");assert.equal((await row(verified.id)).verified,true);
  assert.equal((await row(second.id)).status,"accepted");assert.equal((await row(second.id)).challengeId,targets.second);
  assert.equal((await row(deleted.id)).status,"pending");assert.ok((await row(deleted.id)).deletedAt);
  const merged=await req("POST",`/api/admin/challenges/${targets.second}/merge`,adminCookie,{targetId:targets.first});
  assert.equal(merged.statusCode,200,merged.body);
  assert.equal((await row(second.id)).status,"pending");assert.equal((await row(second.id)).challengeId,targets.first);
  assert.equal((await row(verified.id)).status,"accepted");
});

test("Ping 点 API 使用会话身份；管理员禁用/恢复有审计且不能由玩家自报权限", async () => {
  const pack = (await db.insert(s.campaign).values({name:'Ping Test',shortName:'Ping Test'}).returning())[0];
  const target = (await db.insert(s.map).values({campaignId:pack.id,name:'Ping Map'}).returning())[0];
  const ch = (await db.insert(s.challenge).values({scope:'map',mapId:target.id,name:'C',tierCode:'t7'}).returning())[0];
  const wish = (await db.insert(s.wishlistEntry).values({accountId:owner,challengeId:ch.id}).returning())[0];
  const url = `/api/wishlist/ping?wishId=${wish.id}`;
  assert.equal((await req('GET',url)).statusCode,401);
  assert.equal((await req('GET',url,outsiderCookie)).statusCode,404);
  assert.equal((await req('GET',url,ownerCookie)).json().eligible,true);
  assert.equal((await req('POST','/api/wishlist/ping',outsiderCookie,{wishId:wish.id,accountId:owner,point:null})).statusCode,404);
  assert.equal((await req('POST','/api/admin/ping-permissions',ownerCookie,{playerId:player,disabled:true,role:'super_admin',accountId:admin})).statusCode,403);
  assert.equal((await req('POST','/api/admin/ping-permissions',adminCookie,{playerId:player,disabled:true})).statusCode,200);
  assert.equal((await req('GET',url,ownerCookie)).json().disabled,true);
  const denied = await req('POST','/api/wishlist/ping',ownerCookie,{wishId:wish.id,point:{sid:'fake',side:'Normal',roomKey:'fake'}});
  assert.equal(denied.statusCode,403); assert.equal(denied.json().pingError,'disabled');
  assert.equal((await req('POST','/api/wishlist/ping',ownerCookie,{wishId:wish.id,point:null})).statusCode,200);
  assert.equal((await req('POST','/api/admin/ping-permissions',adminCookie,{playerId:player,disabled:false})).statusCode,200);
  assert.equal((await req('GET',url,ownerCookie)).json().disabled,false);
  const audit = await pool.query("SELECT type FROM audit_log WHERE type IN ('禁用 Ping 点','恢复 Ping 点')");
  assert.equal(audit.rows.length,2);
});
