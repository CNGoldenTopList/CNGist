export type ImportEntry = { sid: string; side: "Normal" | "BSide" | "CSide"; names: string[] };
export type NamedMap = { id: number; name: string; cnName: string | null };
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function parseImportEntries(value: unknown): ImportEntry[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 2000) return null;
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.sid !== "string" ||
      !row.sid.trim() || row.sid !== row.sid.trim() || row.sid.length > 512 ||
      !["Normal", "BSide", "CSide"].includes(row.side) ||
      !Array.isArray(row.names) || !row.names.length || row.names.length > 8 ||
      row.names.some((name: unknown) => typeof name !== "string" || !name.trim() || name.length > 400)) return null;
    const key = JSON.stringify([row.sid, row.side]);
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return value as ImportEntry[];
}

export function matchingMaps(entry: ImportEntry, maps: NamedMap[]) {
  const names = new Set(entry.names.map(normalize));
  return maps.filter((map) => [map.name, map.cnName].some((name) => name && names.has(normalize(name))));
}
