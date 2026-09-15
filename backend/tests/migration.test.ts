/** 旧 ID 迁移是不可逆的数据边界，用独立内存 PostgreSQL 验证整笔转换。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { importSource } from "../scripts/db/import-source";

test("旧库只读迁移：预览回滚、引用及凭证保留、序列续增、拒绝重复导入", async () => {
  const source = new PGlite(), target = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) await target.exec(readFileSync(new URL(file,folder),"utf8"));
    await source.exec(`
      CREATE TABLE tier(code text, rank integer, is_official boolean);
      CREATE TABLE player(id text PRIMARY KEY,name text);
      INSERT INTO player VALUES('player-old','正式玩家名');
      CREATE TABLE campaign(id text PRIMARY KEY,name text,short_name text,blurb text,banner text);
      INSERT INTO campaign VALUES('pack-old','Pack','Pack','公告','/images/pack.png');
      CREATE TABLE map(id text PRIMARY KEY,campaign_id text,name text);
      INSERT INTO map VALUES('map-old','pack-old','Map');
      CREATE TABLE challenge(id text PRIMARY KEY,scope text,map_id text,name text,tier_code text);
      INSERT INTO challenge VALUES('challenge-a','map','map-old','C','t7'),('challenge-b','map','map-old','FC','t7');
      CREATE TABLE challenge_relation(from_id text,to_id text,PRIMARY KEY(from_id,to_id));
      INSERT INTO challenge_relation VALUES('challenge-b','challenge-a');
      CREATE TABLE account(id text PRIMARY KEY,display_name text,claimed_player_id text,preferences jsonb);
      INSERT INTO account VALUES('account-old','账户','player-old','{"favoriteCampaignIds":["pack-old"]}');
      CREATE TABLE auth_identity(id text PRIMARY KEY,account_id text,provider text,subject text,secret text);
      INSERT INTO auth_identity VALUES('identity-old','account-old','password','user@example.test','original-password-hash');
      CREATE TABLE session(id text PRIMARY KEY,account_id text,token_hash text,expires_at timestamptz);
      INSERT INTO session VALUES('session-old','account-old','original-session-hash','2030-01-01');
      CREATE TABLE submission(id text PRIMARY KEY,challenge_id text,player_id text,submitted_by text,status text,deleted_at timestamptz);
      INSERT INTO submission VALUES('record-old','challenge-b','player-old','account-old','hidden','2026-09-01');
      CREATE TABLE submission_tag(id text PRIMARY KEY,submission_id text,kind text,text text);
      INSERT INTO submission_tag VALUES('tag-old','record-old','badge','RAW');
      CREATE TABLE trash_item(id text PRIMARY KEY,kind text,target_id text,label text);
      INSERT INTO trash_item VALUES('trash-old','record','record-old','记录');
      CREATE TABLE tracker_device(id uuid PRIMARY KEY,account_id text,name text,token_hash text);
      INSERT INTO tracker_device VALUES('11111111-1111-4111-8111-111111111111','account-old','Mod','original-device-hash');
      CREATE TABLE tracker_cct_storage(account_id text PRIMARY KEY,enabled boolean,history_epoch uuid);
      INSERT INTO tracker_cct_storage VALUES('account-old',true,'22222222-2222-4222-8222-222222222222');
      CREATE TABLE tracker_presence(device_id uuid PRIMARY KEY,account_id text,history_epoch uuid);
      INSERT INTO tracker_presence VALUES('11111111-1111-4111-8111-111111111111','account-old','22222222-2222-4222-8222-222222222222');
      CREATE TABLE tracker_area_stats(id text PRIMARY KEY,account_id text,device_id uuid,dataset_id uuid,sid text,side text,total_deaths integer);
      INSERT INTO tracker_area_stats VALUES('stats-old','account-old','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','Map/SID','Normal',42);
    `);
    for(const row of (await target.query<{code:string;rank:number;is_official:boolean}>("SELECT code,rank,is_official FROM tier")).rows) await source.query("INSERT INTO tier VALUES($1,$2,$3)",[row.code,row.rank,row.is_official]);
    const before=(await source.query("SELECT * FROM account")).rows;
    await source.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const run=(apply=false,assets?:Record<string,unknown>)=>importSource(source as unknown as PoolClient,target as unknown as PoolClient,{apply,assets:assets as never});
    await target.exec("BEGIN");
    await assert.rejects(run(),/封面/);
    await target.exec("ROLLBACK; BEGIN");
    const assets={"/images/pack.png":{objectKey:"catalog/pack.png",contentType:"image/png",bytes:100}};
    const preview=await run(false,assets);assert.equal(preview.dryRun,true);
    await target.exec("ROLLBACK");assert.equal((await target.query("SELECT * FROM account")).rows.length,0);
    await target.exec("BEGIN");const result=await run(true,assets);await target.exec("COMMIT");assert.equal(result.dryRun,false);
    assert.deepEqual((await source.query("SELECT * FROM account")).rows,before);
    assert.deepEqual((await target.query("SELECT id,claimed_player_id,preferences FROM account")).rows,[{id:1,claimed_player_id:1,preferences:{favoriteCampaignIds:[1]}}]);
    assert.equal((await target.query<{secret:string}>("SELECT secret FROM auth_identity")).rows[0].secret,"original-password-hash");
    assert.equal((await target.query<{token_hash:string}>("SELECT token_hash FROM session")).rows[0].token_hash,"original-session-hash");
    assert.deepEqual((await target.query("SELECT id,account_id,external_id,token_hash FROM tracker_device")).rows,[{id:1,account_id:1,external_id:"11111111-1111-4111-8111-111111111111",token_hash:"original-device-hash"}]);
    assert.deepEqual((await target.query("SELECT device_id,account_id,total_deaths FROM tracker_area_stats")).rows,[{device_id:1,account_id:1,total_deaths:42}]);
    assert.deepEqual((await target.query("SELECT from_id,to_id FROM challenge_relation")).rows,[{from_id:2,to_id:1}]);
    assert.equal((await target.query<{verified:boolean}>("SELECT verified FROM submission")).rows[0].verified,true);
    assert.equal((await target.query<{target_id:number}>("SELECT target_id FROM trash_item")).rows[0].target_id,1);
    assert.equal((await target.query<{banner_key:string}>("SELECT banner_key FROM campaign")).rows[0].banner_key,"catalog/pack.png");
    assert.equal((await target.query<{id:number}>("INSERT INTO player(name) VALUES('新玩家') RETURNING id")).rows[0].id,2);
    assert.equal((await target.query<{new_id:number}>("SELECT new_id FROM migration_id_map WHERE entity='submission' AND old_id='record-old'")).rows[0].new_id,1);
    await target.exec("BEGIN");await assert.rejects(run(true,assets),/非空/);await target.exec("ROLLBACK");
    await source.exec("ROLLBACK");
  } finally { await source.close();await target.close(); }
});


test("记录 verified 增量迁移按正式 Tier 回填，保留状态并默认 false", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8"));
    await pg.exec(`
      INSERT INTO campaign(id,name,short_name) VALUES(1,'Pack','Pack');
      INSERT INTO player(id,name) VALUES(1,'Player');
      INSERT INTO challenge(id,scope,campaign_id,name,tier_code) VALUES
        (1,'campaign',1,'Tier','t7'),(2,'campaign',1,'Std','low-std'),
        (3,'campaign',1,'Unknown','undetermined'),(4,'campaign',1,'Null',null);
      INSERT INTO submission(id,challenge_id,player_id,status,deleted_at) VALUES
        (1,1,1,'accepted',null),(2,1,1,'pending',null),(3,1,1,'hidden',now()),
        (4,2,1,'accepted',null),(5,3,1,'accepted',null),(6,4,1,'accepted',null);
    `);
    await pg.exec(readFileSync(new URL("../drizzle/0001_submission_verified.sql", import.meta.url), "utf8"));
    assert.deepEqual((await pg.query("SELECT id,status,verified FROM submission ORDER BY id")).rows, [
      {id:1,status:'accepted',verified:true},{id:2,status:'pending',verified:true},
      {id:3,status:'hidden',verified:true},{id:4,status:'accepted',verified:false},
      {id:5,status:'accepted',verified:false},{id:6,status:'accepted',verified:false},
    ]);
    assert.equal((await pg.query<{deleted:boolean}>("SELECT deleted_at IS NOT NULL AS deleted FROM submission WHERE id=3")).rows[0].deleted,true);
    assert.equal((await pg.query<{verified:boolean}>("INSERT INTO submission(id,challenge_id,player_id) VALUES(7,1,1) RETURNING verified")).rows[0].verified,false);
  } finally { await pg.close(); }
});
