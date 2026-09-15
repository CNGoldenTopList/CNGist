import { entityId } from "../../../../shared/src/entity-id";
import { parseImportEntries } from "./import-matching";

export type CatalogImportEntry = {
  sid: string; side: "Normal" | "BSide" | "CSide";
  name: string; cnName?: string; mapId?: number;
};
export const normalizeImportName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function parseCatalogImport(body: Record<string, unknown>) {
  const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= max;
  if (!entityId(body.campaignId) || (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
      !Array.isArray(body.entries) || !body.entries.length || body.entries.length > 200) return null;
  const entries: CatalogImportEntry[] = [];
  const names = new Set<string>();
  for (const row of body.entries) {
    if (!row || typeof row !== "object" || !text(row.name, 300) ||
        (row.cnName !== undefined && !text(row.cnName, 300)) ||
        (row.mapId !== undefined && !entityId(row.mapId))) return null;
    // Duplicate names across incoming maps must be resolved explicitly in separate requests.
    const keys = new Set([row.name, row.cnName].filter(Boolean).map(normalizeImportName));
    for (const key of keys) { if (names.has(key)) return null; names.add(key); }
    entries.push({ sid: row.sid, side: row.side, name: row.name,
      ...(row.cnName === undefined ? {} : { cnName: row.cnName }),
      ...(row.mapId === undefined ? {} : { mapId: row.mapId }) });
  }
  if (!parseImportEntries(entries.map(e => ({ ...e, names: [e.name] })))) return null;
  return { campaignId: body.campaignId as number, dryRun: body.dryRun !== false, entries };
}
