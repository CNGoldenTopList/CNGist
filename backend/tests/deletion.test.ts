import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { Tx } from "../src/modules/admin/audit";
import { deleteTrashedEntity } from "../src/modules/admin/deletion";
import { confirmTrashDeletion } from "../src/modules/admin/trash";
import { commandScope } from "../src/modules/admin/transaction";
const admin={id:1,displayName:"管理员",role:"super_admin" as const};
test("彻底删除地图包级联清理全部子项，保留其他地图包、玩家及讨论；鉴权和回滚有效",async()=>{
 const pg=new PGlite();
 try{
  const folder=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL(file,folder),'utf8'));
  const db=drizzle(pg,{schema});
  await pg.exec(`
   INSERT INTO account(id,display_name,role) VALUES(1,'管理员','super_admin');
   INSERT INTO player(id,name) VALUES(1,'玩家');
   INSERT INTO campaign(id,name,short_name,deleted_at) VALUES(1,'Pack','Pack',now()),(2,'Keep','Keep',null);
   INSERT INTO map(id,campaign_id,name,deleted_at) VALUES(1,1,'A',null),(2,1,'B',now()),(3,2,'Keep',null);
   INSERT INTO challenge(id,scope,map_id,campaign_id,name) VALUES(1,'map',1,null,'C'),(2,'map',2,null,'FC'),(3,'campaign',null,1,'All'),(4,'map',3,null,'Keep');
   INSERT INTO submission(id,challenge_id,player_id,status,deleted_at) VALUES(1,1,1,'accepted',null),(2,2,1,'pending',now()),(3,3,1,'hidden',null),(4,4,1,'accepted',null);
   INSERT INTO submission_tag(submission_id,kind,text) VALUES(1,'badge','FC'),(3,'mark','Hidden'),(4,'note','Keep');
   INSERT INTO wishlist_entry(account_id,challenge_id) VALUES(1,1),(1,4);
   INSERT INTO challenge_relation(from_id,to_id) VALUES(1,2);
   INSERT INTO challenge_relation_override(map_id) VALUES(1);
   INSERT INTO campaign_hall(id,campaign_id,name,color,sort_order) VALUES(1,1,'Hall','#67c9ff',0);
   INSERT INTO campaign_hall_map(hall_id,map_id,sort_order) VALUES(1,1,0);
   INSERT INTO campaign_menu_item(section,position,campaign_id) VALUES('fixed',0,1);
   INSERT INTO tracker_map_binding(sid,side,map_id) VALUES('a','Normal',1),('b','Normal',3);
   INSERT INTO golden_room_rule(map_id,sid,side,room_key,room_name) VALUES(1,'a','Normal','room','Room');
   INSERT INTO suggestion(id,title,kind,state,campaign_id,map_id,challenge_id) VALUES(1,'讨论','general','open',1,1,1);
   INSERT INTO suggestion_response(suggestion_id,player) VALUES(1,'玩家');
   INSERT INTO trash_item(id,kind,target_id,label) VALUES(1,'campaign',1,'Pack'),(2,'map',2,'B'),(3,'challenge',2,'FC'),(4,'record',2,'Record'),(5,'map',3,'Keep');
   INSERT INTO trash_vote(trash_item_id,account_id) VALUES(1,1),(2,1);
  `);
  const run=()=>db.transaction(tx=>commandScope.run(tx as unknown as Tx,()=>confirmTrashDeletion(admin,1)));
  assert.equal((await confirmTrashDeletion({...admin,role:'admin'},1)).ok,false);
  await assert.rejects(db.transaction(async tx=>{await deleteTrashedEntity(tx as unknown as Tx,"campaign",1);throw new Error('rollback');}),/rollback/);
  assert.equal((await pg.query('SELECT * FROM submission')).rows.length,4);
  assert.equal((await run()).ok,true);
  for(const table of ['campaign','map','challenge','submission','submission_tag','wishlist_entry','tracker_map_binding','trash_item'])assert.equal((await pg.query(`SELECT * FROM ${table}`)).rows.length,1,table);
  for(const table of ['challenge_relation','challenge_relation_override','campaign_hall','campaign_hall_map','campaign_menu_item','golden_room_rule','trash_vote'])assert.equal((await pg.query(`SELECT * FROM ${table}`)).rows.length,0,table);
  assert.equal((await pg.query('SELECT * FROM player')).rows.length,1);
  assert.equal((await pg.query('SELECT * FROM suggestion_response')).rows.length,1);
  assert.deepEqual((await pg.query('SELECT campaign_id,map_id,challenge_id FROM suggestion')).rows,[{campaign_id:null,map_id:null,challenge_id:null}]);
  assert.equal((await pg.query('SELECT * FROM audit_log')).rows.length,1);
  assert.equal((await run()).ok,false);
  await pg.exec("INSERT INTO campaign(name,short_name) VALUES('Pack','Pack')");
 }finally{await pg.close()}
});

for (const kind of ['map','challenge','record','player'] as const) test(`${kind} 独立删除仅作用于自身及子项，父级和兄弟条目保留`,async()=>{
 const pg=new PGlite();
 try {
  const folder=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL(file,folder),'utf8'));
  const db=drizzle(pg,{schema});
  await pg.exec(`
   INSERT INTO player(id,name) VALUES(1,'Target'),(2,'Keep');
   INSERT INTO account(id,display_name,role,claimed_player_id) VALUES(1,'管理员','super_admin',1);
   INSERT INTO player_claim_request(account_id,bilibili_uid,bilibili_name,status,result_player_id) VALUES(1,'123','Target','approved',1);
   INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
   INSERT INTO map(id,campaign_id,name) VALUES(1,1,'A'),(2,1,'B');
   INSERT INTO challenge(id,scope,map_id,campaign_id,name) VALUES(1,'map',1,null,'C'),(2,'map',1,null,'FC'),(3,'map',2,null,'Keep'),(4,'campaign',null,1,'Multi');
   INSERT INTO submission(id,challenge_id,player_id,status) VALUES(1,1,1,'accepted'),(2,2,1,'pending'),(3,3,2,'accepted'),(4,4,2,'accepted');
   INSERT INTO submission(id,player_id,proposed_target) VALUES(5,1,'{"campaignName":"Unrelated proposal"}');
   INSERT INTO submission_tag(submission_id,kind,text) VALUES(1,'badge','FC'),(2,'mark','Hidden'),(3,'note','Keep');
  `);
  const table=kind==='record'?'submission':kind;
  await pg.exec(`UPDATE ${table} SET deleted_at=now() WHERE id=1`);
  await pg.query('INSERT INTO trash_item(id,kind,target_id,label) VALUES(1,$1,1,$2)',[kind,'Target']);
  const run=()=>db.transaction(tx=>commandScope.run(tx as unknown as Tx,()=>confirmTrashDeletion(admin,1)));
  // 恢复与删除竞态：回收站残留项也不能删除已经恢复的对象。
  await pg.exec(`UPDATE ${table} SET deleted_at=null WHERE id=1`);
  await assert.rejects(run(),/已恢复/);
  await pg.exec(`UPDATE ${table} SET deleted_at=now() WHERE id=1`);
  assert.equal((await run()).ok,true);
  const ids=async(table:string)=>(await pg.query<{id:number}>(`SELECT id FROM ${table} ORDER BY id`)).rows.map(r=>r.id);
  assert.deepEqual(await ids('campaign'),[1]);
  assert.deepEqual(await ids('map'),kind==='map'?[2]:[1,2]);
  assert.deepEqual(await ids('challenge'),kind==='map'?[3,4]:kind==='challenge'?[2,3,4]:[1,2,3,4]);
  assert.deepEqual(await ids('submission'),kind==='map'?[3,4,5]:kind==='player'?[3,4]:[2,3,4,5]);
  assert.deepEqual(await ids('player'),kind==='player'?[2]:[1,2]);
  assert.deepEqual(await ids('account'),[1]);
  if(kind==='player'){
   assert.deepEqual((await pg.query('SELECT claimed_player_id FROM account')).rows,[{claimed_player_id:null}]);
   assert.deepEqual((await pg.query('SELECT result_player_id FROM player_claim_request')).rows,[{result_player_id:null}]);
  }
  assert.deepEqual(await ids('trash_item'),[]);
 } finally {await pg.close()}
});
