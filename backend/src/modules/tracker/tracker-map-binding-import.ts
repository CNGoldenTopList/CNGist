import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { campaign, map, trackerMapBinding } from "../../db/schema/index";
import { writeAudit } from "../admin/audit";
import type { Admin, Result } from "../admin/admin-commands";
import { matchingMaps, parseImportEntries } from "./import-matching";

/** A bounded administrative binding command, not a general catalog importer. */
export async function importMapBindings(admin: Admin, body: Record<string, unknown>): Promise<Result<unknown>> {
  const entries = parseImportEntries(body.entries);
  if (!entries || typeof body.campaign !== "string" || !body.campaign.trim() || body.campaign.length > 400 ||
    (body.dryRun !== undefined && typeof body.dryRun !== "boolean")) {
    return { ok: false, error: "需要地图包 ID/准确名称和 1–2000 条不重复的 SID/面/名称。", status: 400 };
  }
  const selector = body.campaign.trim();
  return db.transaction(async (tx) => {
    const packs = await tx.select().from(campaign).where(isNull(campaign.deletedAt)).for("share");
    const byId = packs.filter((pack) => String(pack.id) === selector);
    const matches = byId.length ? byId : packs.filter((pack) =>
      [pack.name, pack.cnName, pack.shortName].some((name) => name?.toLowerCase() === selector.toLowerCase()));
    if (matches.length !== 1) return { ok: false as const, error: "地图包不存在或名称不唯一，请使用地图包 ID。", status: 400 };
    const pack = matches[0];
    const maps = await tx.select({ id: map.id, name: map.name, cnName: map.cnName }).from(map)
      .where(and(eq(map.campaignId, pack.id), isNull(map.deletedAt))).for("share");
    const results = [];
    // Stable order avoids deadlocks between overlapping batch requests.
    for (const entry of [...entries].sort((a, b) => JSON.stringify([a.sid, a.side]).localeCompare(JSON.stringify([b.sid, b.side])))) {
      const candidates = matchingMaps(entry, maps);
      const base = { sid: entry.sid, side: entry.side, names: entry.names };
      if (candidates.length !== 1) {
        results.push({ ...base, status: candidates.length ? "ambiguous" : "unmatched", candidates });
        continue;
      }
      const target = candidates[0];
      const existing = await tx.select().from(trackerMapBinding).where(and(
        eq(trackerMapBinding.sid, entry.sid), eq(trackerMapBinding.side, entry.side), eq(trackerMapBinding.status, "approved")));
      if (existing.length) {
        results.push({ ...base, mapId: target.id, status: existing[0].mapId === target.id ? "unchanged" : "conflict", existingMapId: existing[0].mapId });
        continue;
      }
      if (body.dryRun === true) {
        results.push({ ...base, mapId: target.id, status: "would_create" });
        continue;
      }
      const inserted = await tx.insert(trackerMapBinding).values({
        accountId: admin.id, sid: entry.sid, side: entry.side, mapId: target.id,
        status: "approved", reviewedBy: admin.id, reviewedAt: new Date(),
        campaignName: pack.name, chapterName: target.name, reviewNote: "管理员从本地 Mod 批量配对",
      }).onConflictDoNothing({ target: [trackerMapBinding.sid, trackerMapBinding.side], where: sql`status = 'approved'` }).returning({ id: trackerMapBinding.id });
      if (inserted.length) {
        await writeAudit(tx, admin, "通过地图配对", `${entry.sid} / ${entry.side} 配到 ${pack.name} · ${target.name}（批量导入）`);
        results.push({ ...base, mapId: target.id, status: "created" });
      } else {
        const current = await tx.select().from(trackerMapBinding).where(and(eq(trackerMapBinding.sid, entry.sid), eq(trackerMapBinding.side, entry.side), eq(trackerMapBinding.status, "approved")));
        results.push({ ...base, mapId: target.id, status: current[0]?.mapId === target.id ? "unchanged" : "conflict", existingMapId: current[0]?.mapId });
      }
    }
    return { ok: true as const, data: { campaignId: pack.id, dryRun: body.dryRun === true, results } };
  });
}
