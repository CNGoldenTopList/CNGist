import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { Tx } from "../src/modules/admin/audit";
import { commandScope } from "../src/modules/admin/transaction";
import { updateCampaign, updateMap } from "../src/modules/catalog/commands";

for (const kind of ["map", "campaign"] as const) {
  test(`${kind} 修改资料保留未提交的展示图，换图和显式清空仍生效并记录图片 key`, async () => {
    const pg = new PGlite();
    try {
      const folder = new URL("../drizzle/", import.meta.url);
      for (const file of readdirSync(folder).filter(f => f.endsWith(".sql")).sort()) {
        await pg.exec(readFileSync(new URL(file, folder), "utf8"));
      }
      const db = drizzle(pg, { schema });
      await pg.exec(`
        INSERT INTO image_asset(object_key,content_type,bytes) VALUES('old.png','image/png',100),('new.png','image/png',100);
        INSERT INTO campaign(id,name,short_name,banner_key) VALUES(1,'Pack','Pack','old.png');
        INSERT INTO map(id,campaign_id,name,banner_key) VALUES(1,1,'Map','old.png');
      `);
      const update = kind === "map" ? updateMap : updateCampaign;
      const run = (patch: { name: string; notice?: string; banner?: string | null }) => db.transaction(tx =>
        commandScope.run(tx as unknown as Tx, () => update({ id: 1, displayName: "测试管理员", role: "admin" }, 1, patch)));
      const banner = async () => (await pg.query<{ banner_key: string | null }>(`SELECT banner_key FROM ${kind} WHERE id=1`)).rows[0].banner_key;
      assert.equal((await run({ name: "Renamed", notice: "Updated notice" })).ok, true);
      assert.equal(await banner(), "old.png");
      assert.doesNotMatch((await pg.query<{ detail: string }>("SELECT detail FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0].detail, /展示图/);
      assert.equal((await run({ name: "Renamed", banner: "new.png" })).ok, true);
      assert.equal(await banner(), "new.png");
      assert.match((await pg.query<{ detail: string }>("SELECT detail FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0].detail, /old\.png → new\.png/);
      assert.equal((await run({ name: "Renamed", banner: null })).ok, true);
      assert.equal(await banner(), null);
      assert.equal((await run({ name: "Renamed", notice: "Still no image" })).ok, true);
      assert.equal(await banner(), null);
      await run({ name: "Renamed", banner: "old.png" });
      assert.equal((await run({ name: "Renamed", banner: "" })).ok, true);
      assert.equal(await banner(), null);
    } finally { await pg.close(); }
  });
}
