import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { Tx } from "../src/modules/admin/audit";
import { commandScope } from "../src/modules/admin/transaction";
import { createCatalogEntity, updateChallenge, type CreateInput } from "../src/modules/catalog/commands";
import { challengeTypes } from "../../shared/src/types";

test("挑战类型支持独立、嵌套和多地图创建；编辑保留未传类型并拒绝无效类型", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) {
      await pg.exec(readFileSync(new URL(file, folder), "utf8"));
    }
    const db = drizzle(pg, { schema });
    const admin = { id: 1, displayName: "测试管理员", role: "admin" } as const;
    const run = <T>(work: () => Promise<T>) => db.transaction(tx => commandScope.run(tx as unknown as Tx, work));
    const create = (input: CreateInput) => run(() => createCatalogEntity(admin, input));
    const rows = async () => (await pg.query<{ id: number; name: string; type: string }>("SELECT id,name,type FROM challenge ORDER BY id")).rows;
    assert.equal((await create({ kind: "campaign", name: "Pack", maps: [{ name: "Map", challenges: [{ name: "Combined", type: "C/FC", tier: "mid-std" }] }] })).ok, true);
    const pack = (await pg.query<{ id: number }>("SELECT id FROM campaign")).rows[0].id;
    const map = (await pg.query<{ id: number }>("SELECT id FROM map")).rows[0].id;
    assert.equal((await rows())[0].type, "C/FC");
    assert.equal((await create({ kind: "map", name: "Second map", campaignId: pack, challenges: [{ name: "Full clear", type: "FC" }, { name: "Legacy default" }] })).ok, true);
    assert.deepEqual((await rows()).map(row => row.type), ["C/FC", "FC", "Other"]);
    for (const scope of ["map", "campaign"]) {
      for (const type of challengeTypes) {
        assert.equal((await create({ kind: "challenge", name: `${scope} ${type}`, scope, mapId: map, campaignId: pack, type })).ok, true);
        assert.equal((await rows()).at(-1)?.type, type);
      }
    }
    const id = (await rows())[0].id;
    const edit = (type?: unknown) => run(() => updateChallenge(admin, id, { name: "Combined", tier: "mid-std", ...(type === undefined ? {} : { type }) }));
    assert.equal((await edit("C")).ok, true);
    assert.match((await pg.query<{ detail: string }>("SELECT detail FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0].detail, /类型.*C\/FC → C/);
    assert.equal((await edit()).ok, true);
    assert.equal((await rows())[0].type, "C");
    assert.equal((await edit("C/FC")).ok, true);
    assert.equal((await rows())[0].type, "C/FC");
    for (const type of ["invalid", "", null, 42]) {
      assert.equal((await edit(type)).ok, false);
      assert.equal((await create({ kind: "challenge", name: "Bad", mapId: map, type })).ok, false);
      assert.equal((await create({ kind: "map", name: "Bad map", campaignId: pack, challenges: [{ name: "Bad", type }] })).ok, false);
      assert.equal((await create({ kind: "campaign", name: "Bad pack", maps: [{ name: "Bad map", challenges: [{ name: "Bad", type }] }] })).ok, false);
    }
    assert.equal((await rows())[0].type, "C/FC");
    assert.equal((await pg.query("SELECT id FROM campaign WHERE name='Bad pack'")).rows.length, 0);
    assert.equal((await pg.query("SELECT id FROM map WHERE name='Bad map'")).rows.length, 0);
  } finally { await pg.close(); }
});
