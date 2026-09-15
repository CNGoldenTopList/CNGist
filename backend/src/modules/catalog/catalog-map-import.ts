import { and, eq, sql } from "drizzle-orm";
import { campaign, map, trackerMapBinding } from "../../db/schema/index";
import { writeAudit, type Tx } from "../admin/audit";
import type { Admin } from "../admin/admin-commands";
import { matchingMaps } from "../tracker/import-matching";
import { parseCatalogImport } from "../tracker/catalog-import";

/** Caller owns the transaction; any unexpected failure rolls back maps, bindings and audit together. */
export async function importCatalogMapsTransaction(tx: Tx, admin: Admin, input: NonNullable<ReturnType<typeof parseCatalogImport>>) {
  // Also serialize against legacy/manual creation and binding approval paths which do not use advisory locks.
  // Bounded administrative batches only; locks are released at transaction end, including dry runs.
  await tx.execute(sql`LOCK TABLE map, tracker_map_binding IN SHARE ROW EXCLUSIVE MODE`);
  const [pack] = await tx.select().from(campaign).where(eq(campaign.id, input.campaignId)).for("share");
  if (!pack || pack.deletedAt) return { ok: false as const, error: "地图包不存在或已回收。", status: 400 };
  const maps = await tx.select().from(map).where(eq(map.campaignId, pack.id));
  let nextOrder = maps.reduce((max, m) => Math.max(max, m.sortOrder ?? -1), -1) + 1;
  const results = [];
  for (const entry of input.entries) {
    const base = { sid: entry.sid, side: entry.side, name: entry.name };
    const matches = matchingMaps({ ...entry, names: [entry.name, ...(entry.cnName ? [entry.cnName] : [])] }, maps);
    const [binding] = await tx.select().from(trackerMapBinding).where(and(
      eq(trackerMapBinding.sid, entry.sid), eq(trackerMapBinding.side, entry.side), eq(trackerMapBinding.status, "approved")));
    if (binding) {
      const target = maps.find(m => m.id === binding.mapId);
      const conflict = !target || target.deletedAt || (entry.mapId && entry.mapId !== target.id) ||
        (!entry.mapId && matches.some(m => m.id !== target.id));
      results.push({ ...base, mapId: binding.mapId, status: conflict ? "conflict" : "unchanged" });
      continue;
    }
    let target = entry.mapId ? maps.find(m => m.id === entry.mapId) : maps.find(m => m.id === matches[0]?.id);
    if (entry.mapId && (!target || target.deletedAt)) {
      results.push({ ...base, status: "conflict", reason: "invalid_target" }); continue;
    }
    if (!entry.mapId && matches.length > 1) {
      results.push({ ...base, status: "ambiguous", candidates: matches.map(m => m.id) }); continue;
    }
    if (target?.deletedAt) {
      results.push({ ...base, status: "conflict", reason: "deleted_target", mapId: target.id }); continue;
    }
    const create = !target;
    if (input.dryRun) {
      results.push({ ...base, mapId: target?.id ?? null, status: create ? "would_create" : "would_bind" });
      continue;
    }
    if (!target) {
      [target] = await tx.insert(map).values({ campaignId: pack.id,
        name: entry.name, cnName: entry.cnName ?? null, sortOrder: nextOrder++ }).returning();
      maps.push(target);
    }
    await tx.insert(trackerMapBinding).values({ accountId: admin.id, sid: entry.sid, side: entry.side,
      mapId: target.id, status: "approved", reviewedBy: admin.id, reviewedAt: new Date(),
      campaignName: pack.name, chapterName: target.name, reviewNote: "管理员批量补图并配对" });
    if (create) await writeAudit(tx, admin, "新建地图", `批量补图：${pack.name} · ${target.name}`);
    await writeAudit(tx, admin, "通过地图配对", `${entry.sid} / ${entry.side} 配到 ${pack.name} · ${target.name}（批量补图）`);
    results.push({ ...base, mapId: target.id, status: create ? "created" : "bound" });
  }
  return { ok: true as const, data: { campaignId: pack.id, dryRun: input.dryRun, results } };
}
