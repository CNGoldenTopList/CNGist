import { CctError, cctUuid } from "./cct-state";

export const ROUTE_BYTES = 8 * 1024 * 1024;
export type RouteRoom = { debugRoomName: string; customRoomName: string | null; isNonGameplayRoom: boolean; groupedRooms: string[]; difficultyWeight: number };
export type SharedPath = { name: string; checkpoints: { name: string; abbreviation: string; rooms: RouteRoom[] }[]; ignoredRooms: string[]; trackWingedGolden: boolean };
export type TerrainRoom = { name: string; x: number; y: number; width: number; height: number; color: string; dummy: boolean; solids: number[][]; backs: number[][]; spawns: number[][]; berries: number[][]; checkpoints: number[][]; jumpthrus: number[][] };
export type RoutePayload = { route: SharedPath; terrain: TerrainRoom[] };
export function invalid(): never { throw new CctError("invalid_shared_route"); }
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) invalid();
  return v as Record<string, unknown>;
}
export function routeText(v: unknown, max = 256): string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) invalid();
  return v;
}
function integer(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) invalid();
  return v;
}
function bool(v: unknown): boolean { if (typeof v !== "boolean") invalid(); return v; }
function array(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) invalid(); return v; }
export function routeSide(v: unknown) { if (v !== "Normal" && v !== "BSide" && v !== "CSide") invalid(); return v; }
export function parseRoutePayload(input: unknown): RoutePayload {
  const root = object(input, ["route", "terrain"]), r = object(root.route, ["name", "checkpoints", "ignoredRooms", "trackWingedGolden"]);
  let total = 0, shapes = 0;
  const route: SharedPath = {
    name: routeText(r.name), trackWingedGolden: bool(r.trackWingedGolden),
    ignoredRooms: array(r.ignoredRooms, 2000).map(n => routeText(n)),
    checkpoints: array(r.checkpoints, 2000).map(value => {
      const c = object(value, ["name", "abbreviation", "rooms"]);
      return { name: routeText(c.name), abbreviation: routeText(c.abbreviation, 64), rooms: array(c.rooms, 2000).map(value => {
        if (++total > 2000) invalid();
        const n = object(value, ["debugRoomName", "customRoomName", "isNonGameplayRoom", "groupedRooms", "difficultyWeight"]);
        return { debugRoomName: routeText(n.debugRoomName), customRoomName: n.customRoomName === null || n.customRoomName === "" ? null : routeText(n.customRoomName),
          isNonGameplayRoom: bool(n.isNonGameplayRoom), groupedRooms: array(n.groupedRooms, 100).map(n => routeText(n)), difficultyWeight: integer(n.difficultyWeight, -1, 1000000) };
      }) };
    }),
  };
  if (!route.checkpoints.length || !total) invalid();
  const terrain = array(root.terrain, 2000).map(value => {
    const t = object(value, ["name", "x", "y", "width", "height", "color", "dummy", "solids", "backs", "spawns", "berries", "checkpoints", "jumpthrus"]);
    const width = integer(t.width, 1, 10000), height = integer(t.height, 1, 10000);
    function points(key: string, dimensions: number) {
      return array(t[key], 100000).map(p => {
        if (++shapes > 200000) invalid();
        const a = array(p, dimensions); if (a.length !== dimensions) invalid();
        return a.map((v, i) => {
          if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 100000 || (i >= 2 && v < 0)) invalid();
          return v;
        });
      });
    }
    if (typeof t.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(t.color)) invalid();
    return { name: routeText(t.name), x: integer(t.x, -1000000, 1000000), y: integer(t.y, -1000000, 1000000), width, height,
      color: t.color, dummy: bool(t.dummy), solids: points("solids", 4), backs: points("backs", 4), spawns: points("spawns", 2),
      berries: points("berries", 2), checkpoints: points("checkpoints", 2), jumpthrus: points("jumpthrus", 4) };
  });
  const names = new Set(terrain.map(t => t.name));
  if (!terrain.length || names.size !== terrain.length) invalid();
  for (const c of route.checkpoints) for (const n of c.rooms)
    if (![n.debugRoomName, ...n.groupedRooms].every(n => names.has(n))) throw new CctError("route_rooms_missing");
  if (!route.ignoredRooms.every(n => names.has(n))) throw new CctError("route_rooms_missing");
  const result = { route, terrain };
  if (Buffer.byteLength(JSON.stringify(result)) > ROUTE_BYTES) throw new CctError("scope_too_large");
  return result;
}
export function parsePublish(input: Record<string, unknown>) {
  object(input, ["action", "id", "revision", "sid", "side", "sourceId", "route", "terrain"]);
  return { id: cctUuid(input.id), revision: integer(input.revision, 1, Number.MAX_SAFE_INTEGER), sid: routeText(input.sid, 512),
    side: routeSide(input.side), sourceId: input.sourceId == null ? null : cctUuid(input.sourceId), payload: parseRoutePayload({ route: input.route, terrain: input.terrain }) };
}
