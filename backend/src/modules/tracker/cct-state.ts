import { createHash } from "node:crypto";
/* 协议形状与只读窗口读数住在 shared：前端要用同一份，抄两份必然分叉。
   解析与校验留在这里，它们会抛错、会用 node:crypto。 */
import { CCT_LIMITS, roomWindow, type CctMetadata, type CctRoom, type CctRoute, type CctRouteNode, type CctScope, type CctState } from "../../../../shared/src/tracker/cct-types";
export { CCT_LIMITS, roomWindow };
export type { CctMetadata, CctRoom, CctRoute, CctRouteNode, CctScope, CctState };


export class CctError extends Error {
  constructor(public readonly code: string) { super(code); }
}
function requireValue(condition: unknown, code = "invalid_cct_state"): asserts condition {
  if (!condition) throw new CctError(code);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  const result = value as Record<string, unknown>;
  requireValue(Object.keys(result).every(key => keys.includes(key)));
  return result;
}
export function cctText(value: unknown, max = 256): string {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value));
  // Room keys are ordinal: never trim, lowercase or normalize them.
  return value;
}
export function cctUuid(value: unknown): string {
  const result = cctText(value, 36);
  requireValue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result));
  return result.toLowerCase();
}
export function cctInteger(value: unknown, signed = false): number {
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && (signed || value >= 0));
  return value;
}
function bool(value: unknown): boolean { requireValue(typeof value === "boolean"); return value; }
export function cctDisplayText(value: unknown, max = 256): string | null {
  return value === undefined || value === null || value === "" ? null : cctText(value, max);
}
export function parseCctRoute(value: unknown): CctRoute {
  const raw = object(value, ["nodes", "ignoredRooms", "chapterSID", "campaignName", "chapterName", "sideName", "checkpoints"]);
  requireValue(Array.isArray(raw.nodes) && raw.nodes.length <= CCT_LIMITS.rooms);
  requireValue(Array.isArray(raw.ignoredRooms) && raw.ignoredRooms.length <= CCT_LIMITS.rooms);
  const route: CctRoute = {
    chapterSID: cctDisplayText(raw.chapterSID, 512), campaignName: cctDisplayText(raw.campaignName),
    chapterName: cctDisplayText(raw.chapterName), sideName: cctDisplayText(raw.sideName, 64), checkpoints: [],
    nodes: raw.nodes.map(item => {
      const node = object(item, ["roomKey", "checkpointKey", "groupedRooms", "isNonGameplayRoom", "customRoomName"]);
      requireValue(Array.isArray(node.groupedRooms) && node.groupedRooms.length <= 100);
      return { roomKey: cctText(node.roomKey), checkpointKey: cctText(node.checkpointKey), groupedRooms: node.groupedRooms.map(x => cctText(x)), isNonGameplayRoom: bool(node.isNonGameplayRoom), customRoomName: cctDisplayText(node.customRoomName) };
    }), ignoredRooms: raw.ignoredRooms.map(x => cctText(x)),
  };
    requireValue(Array.isArray(raw.checkpoints) && raw.checkpoints.length <= CCT_LIMITS.rooms);
    const checkpoints = raw.checkpoints.map(item => {
      const cp = object(item, ["checkpointKey", "name", "abbreviation"]);
      return { checkpointKey: cctText(cp.checkpointKey), name: cctDisplayText(cp.name), abbreviation: cctDisplayText(cp.abbreviation, 64) };
    });
    const keys = new Set(checkpoints.map(cp => cp.checkpointKey));
    requireValue(keys.size === checkpoints.length, "duplicate_checkpoint");
    requireValue(route.nodes.every(n => keys.has(n.checkpointKey)), "checkpoint_missing");
    route.checkpoints = checkpoints;
  return route;
}
export function parseCctScope(value: unknown): CctScope {
  const v = object(value, ["datasetId", "sid", "side", "segmentKey"]);
  requireValue(v.side === "Normal" || v.side === "BSide" || v.side === "CSide");
  return { datasetId: cctUuid(v.datasetId), sid: cctText(v.sid, 512), side: v.side, segmentKey: cctText(v.segmentKey) };
}
export function parseCctRoom(value: unknown): CctRoom {
  const v = object(value, ["roomKey", "previousAttempts", "successStreak", "successStreakBest", "goldenBerryDeaths", "goldenBerryDeathsSession", "deathsInCurrentRun"]);
  requireValue(Array.isArray(v.previousAttempts) && v.previousAttempts.length <= CCT_LIMITS.attempts);
  const result = {
    roomKey: cctText(v.roomKey), previousAttempts: v.previousAttempts.map(bool),
    successStreak: cctInteger(v.successStreak, true), successStreakBest: cctInteger(v.successStreakBest),
    goldenBerryDeaths: cctInteger(v.goldenBerryDeaths), goldenBerryDeathsSession: cctInteger(v.goldenBerryDeathsSession),
    deathsInCurrentRun: cctInteger(v.deathsInCurrentRun),
  };
  requireValue(result.goldenBerryDeathsSession <= result.goldenBerryDeaths);
  // Do not recompute streaks from the rolling window: CCT manual edits can leave them independent.
  return result;
}
export function parseCctMetadata(value: unknown): CctMetadata {
  const v = object(value, ["cctVersion", "adapterVersion", "cctSessionKey", "settings", "chapter", "route"]);
  const settings = object(v.settings, ["trackNegativeStreaks", "selectedAttemptCount"]);
  const window = cctInteger(settings.selectedAttemptCount);
  requireValue([5, 10, 20, 100].includes(window));
  const chapter = object(v.chapter, ["goldenCollectedCount", "goldenCollectedCountSession"]);
  const total = cctInteger(chapter.goldenCollectedCount), current = cctInteger(chapter.goldenCollectedCountSession);
  requireValue(current <= total);
  const route = v.route === null ? null : parseCctRoute(v.route);
  return {
    cctVersion: cctText(v.cctVersion, 64), adapterVersion: cctText(v.adapterVersion, 64), cctSessionKey: cctText(v.cctSessionKey),
    settings: { trackNegativeStreaks: bool(settings.trackNegativeStreaks), selectedAttemptCount: window },
    chapter: { goldenCollectedCount: total, goldenCollectedCountSession: current }, route,
  };
}
export function parseCctState(value: unknown): CctState {
  const v = object(value, ["metadata", "rooms"]);
  requireValue(Array.isArray(v.rooms) && v.rooms.length <= CCT_LIMITS.rooms);
  const rooms = v.rooms.map(parseCctRoom);
  requireValue(new Set(rooms.map(room => room.roomKey)).size === rooms.length, "duplicate_room");
  rooms.sort((a, b) => a.roomKey < b.roomKey ? -1 : a.roomKey > b.roomKey ? 1 : 0);
  const state = { metadata: parseCctMetadata(v.metadata), rooms };
  requireValue(Buffer.byteLength(JSON.stringify(state)) <= CCT_LIMITS.scopeBytes, "scope_too_large");
  return state;
}

// Canonical JSON for this constrained schema (finite safe integers, strings, arrays, plain objects).
// Unreleased model: freeze cross-language vectors before exposing a wire contract.
export function canonicalCct(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCct).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${canonicalCct(obj[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  requireValue(encoded !== undefined);
  return encoded;
}
export function hashCct(value: unknown): string { return createHash("sha256").update(canonicalCct(value)).digest("hex"); }

export type CctPatch = { replaceRooms: CctRoom[]; removeRooms: string[]; metadata?: CctMetadata };
export function parseCctPatch(value: unknown): CctPatch {
  const v = object(value, ["replaceRooms", "removeRooms", "metadata"]);
  requireValue(Array.isArray(v.replaceRooms) && v.replaceRooms.length <= CCT_LIMITS.rooms);
  requireValue(Array.isArray(v.removeRooms) && v.removeRooms.length <= CCT_LIMITS.rooms);
  const replaceRooms = v.replaceRooms.map(parseCctRoom), removeRooms = v.removeRooms.map(x => cctText(x));
  const keys = [...replaceRooms.map(r => r.roomKey), ...removeRooms];
  requireValue(new Set(keys).size === keys.length, "duplicate_room");
  return { replaceRooms, removeRooms, ...(v.metadata === undefined ? {} : { metadata: parseCctMetadata(v.metadata) }) };
}
export function applyCctPatch(state: CctState, patch: CctPatch): CctState {
  const rooms = new Map(state.rooms.map(room => [room.roomKey, room]));
  for (const key of patch.removeRooms) rooms.delete(key);
  for (const room of patch.replaceRooms) rooms.set(room.roomKey, room);
  return parseCctState({ metadata: patch.metadata ?? state.metadata, rooms: [...rooms.values()] });
}
