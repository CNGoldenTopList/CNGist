import { test,before,after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSharedRouteRepository } from "../src/modules/tracker/shared-route-repository";
import { parseRoutePayload } from "../src/modules/tracker/shared-route";
import { createCctRepository } from "../src/modules/tracker/cct-repository";

const pg=new PGlite(),repo=createSharedRouteRepository(work=>pg.transaction(tx=>work(tx))),cct=createCctRepository(work=>pg.transaction(tx=>work(tx)));
const payload={route:{name:"路线一",checkpoints:[{name:"Start",abbreviation:"ST",rooms:[{debugRoomName:"a",customRoomName:"起点",isNonGameplayRoom:false,groupedRooms:["b"],difficultyWeight:-1},{debugRoomName:"a",customRoomName:null,isNonGameplayRoom:true,groupedRooms:[],difficultyWeight:1}]}],ignoredRooms:[],trackWingedGolden:false},
  terrain:["a","b"].map((name,i)=>({name,x:i*40,y:0,width:40,height:24,color:"#ffffff",dummy:false,solids:[[0,0,40,1]],backs:[],spawns:[[1,2]],berries:[],checkpoints:[],jumpthrus:[]}))};
before(async()=>{const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,"utf8"));});
after(()=>pg.close());
async function fixture(){
  const accountId=Number((await pg.query("INSERT INTO account(display_name) VALUES('Test author') RETURNING id")).rows[0].id);
  const deviceId=Number((await pg.query("INSERT INTO tracker_device(account_id,name,token_hash) VALUES($1,'PC',$2) RETURNING id",[accountId,randomUUID()])).rows[0].id);
  const auth=await cct.setHistoryEnabled(accountId,true);return{accountId,deviceId,historyEpoch:auth.historyEpoch};
}
const publish=()=>({action:"publish",id:randomUUID(),revision:1,sid:"Unlisted/Map",side:"Normal",sourceId:null,...structuredClone(payload)});
test("terrain and CCT room semantics roundtrip; rejects foreign identity, text and oversized structures",()=>{
  assert.deepEqual(parseRoutePayload(payload),payload);
  assert.throws(()=>parseRoutePayload({...payload,accountId:randomUUID()}));
  const bad=structuredClone(payload);bad.route.checkpoints[0].rooms[0].debugRoomName="not-here";assert.throws(()=>parseRoutePayload(bad),/route_rooms_missing/);
  const badText=structuredClone(payload);badText.route.name="bad\nname";assert.throws(()=>parseRoutePayload(badText));
  const badShape=structuredClone(payload);badShape.terrain[0].solids=[[0,0,Infinity,1]];assert.throws(()=>parseRoutePayload(badShape));
  const duplicates=structuredClone(payload);duplicates.terrain[1].name="a";assert.throws(()=>parseRoutePayload(duplicates));
});
test("public list/download works without map binding; exposes only public route data",async()=>{
  const owner=await fixture(),input=publish();await repo.publish(owner,input);
  const list=await repo.list(input.sid,input.side,0,owner.accountId);const summary=list.routes.find(r=>r.id===input.id)!;
  assert.equal(summary.owned,true);assert.equal(summary.author,"Test author");assert.equal(summary.roomCount,1);
  assert.equal(summary.payload,undefined);assert.equal(summary.account_id,undefined);assert.equal(summary.device_id,undefined);
  const result=await repo.read(input.id);assert.deepEqual(result.route,payload.route);assert.deepEqual(result.terrain,payload.terrain);
  assert.equal((await repo.list(input.sid,"BSide")).routes.some(r=>r.id===input.id),false);
});
test("retry is idempotent, latest revision replaces; stale/foreign writes are rejected",async()=>{
  const owner=await fixture(),other=await fixture(),input=publish();await repo.publish(owner,input);await repo.publish(owner,input);
  await assert.rejects(repo.publish(other,input),/shared_route_conflict/);
  await assert.rejects(repo.publish(owner,{...input,accountId:other.accountId}),/invalid_shared_route/);
  const next={...input,revision:2,route:{...input.route,name:"Revised"}};await repo.publish(owner,next);
  await assert.rejects(repo.publish(owner,input),/shared_route_conflict/);
  await assert.rejects(repo.publish(owner,{...next,route:input.route}),/shared_route_conflict/);
  assert.equal((await repo.read(input.id)).route.name,"Revised");
});
test("only owner deletes; tombstones stop delayed retries and retain attribution",async()=>{
  const owner=await fixture(),other=await fixture(),input=publish();await repo.publish(owner,input);
  const derived={...publish(),sourceId:input.id};await repo.publish(other,derived);
  await assert.rejects(repo.remove(other,input.id),/shared_route_missing/);
  await repo.remove(owner,input.id);await repo.remove(owner,input.id);
  await assert.rejects(repo.read(input.id),/shared_route_missing/);
  await assert.rejects(repo.publish(owner,{...input,revision:4}),/shared_route_conflict/);
  const copy=await repo.read(derived.id);assert.equal(copy.sourceId,input.id);assert.equal(copy.sourceName,input.route.name);
  assert.equal((await repo.list(input.sid,input.side)).routes.some(r=>r.id===input.id),false);
});
test("upsert rejects an ownership collision even when the initial lookup saw no row",async()=>{
  const owner=await fixture(),other=await fixture(),input=publish();await repo.publish(owner,input);
  // Model a competing first insert becoming visible after the initial SELECT.
  const racing=createSharedRouteRepository(work=>pg.transaction(tx=>work({query:async(text,values)=>
    text.startsWith("SELECT * FROM tracker_shared_route")?{rows:[]}:tx.query(text,values)})));
  await assert.rejects(racing.publish(other,{...input,revision:99,route:{...input.route,name:"Foreign"}}),/shared_route_conflict/);
  assert.equal((await repo.read(input.id)).route.name,input.route.name);
});
test("device revocation and disabled history are checked again in write transaction",async()=>{
  const owner=await fixture();await pg.query("UPDATE tracker_device SET revoked_at=now() WHERE id=$1",[owner.deviceId]);
  await assert.rejects(repo.publish(owner,publish()),/history_disabled/);
  const another=await fixture();await cct.setHistoryEnabled(another.accountId,false);await assert.rejects(repo.publish(another,publish()),/history_disabled/);
  const third=await fixture();await cct.setHistoryEnabled(third.accountId,false);await cct.setHistoryEnabled(third.accountId,true);await assert.rejects(repo.publish(third,publish()),/history_epoch_invalid/);
});
test("bounded pagination and account quota; deleted payload releases space",async()=>{
  const owner=await fixture();const ids=[];
  for(let i=0;i<22;i++){const input={...publish(),sid:"Pagination/Map"};await repo.publish(owner,input);ids.push(input.id);}
  const first=await repo.list("Pagination/Map","Normal"),second=await repo.list("Pagination/Map","Normal",first.nextOffset!);
  assert.equal(first.routes.length,20);assert.equal(second.routes.length,2);assert.equal(new Set([...first.routes,...second.routes].map(r=>r.id)).size,22);
  await pg.query("UPDATE tracker_shared_route SET payload_bytes=8388608 WHERE id IN (SELECT id FROM tracker_shared_route WHERE account_id=$1 LIMIT 4)",[owner.accountId]);
  await assert.rejects(repo.publish(owner,publish()),/scope_quota_exceeded/);
  for(const id of ids)await repo.remove(owner,id);await repo.publish(owner,publish());
});
