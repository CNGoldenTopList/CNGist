import { CCT_LIMITS, CctError, cctText, parseCctRoute } from "./cct-state";
import type { CctRoute } from "./cct-state";

function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CctError("invalid_route_file");
  return value as Record<string, unknown>;
}
function list(value: unknown, fallback = false): unknown[] {
  if (value === undefined && fallback) return [];
  if (!Array.isArray(value) || value.length > CCT_LIMITS.rooms) throw new CctError("invalid_route_file");
  return value;
}
/** Explicit identity map from the adapter's persistent registry, NOT names or generated array offsets. */
export type RouteIdentity = { segmentKey: string; checkpointKeys: string[] };
export type ImportedRoute = { segmentKey: string; selectedIndex: number | null; route: CctRoute; gameplayRoomCount: number; identityStatus: "supplied" };

/** Reference adapter for legacy bare paths, intermediate bare paths and segments wrappers.
 * Does not access disk, send data, match catalog entities or persist new identities.
 */
export function importCctRouteFile(value: unknown, resolveIdentity: (selectedIndex: number | null, path: Readonly<Record<string, unknown>>) => RouteIdentity): ImportedRoute {
  if (Buffer.byteLength(JSON.stringify(value)) > CCT_LIMITS.scopeBytes) throw new CctError("route_file_too_large");
  const root = obj(value);
  let path = root, selectedIndex: number | null = null;
  if ("segments" in root) {
    const segments = list(root.segments);
    if (!Number.isInteger(root.selectedIndex) || (root.selectedIndex as number) < 0 || (root.selectedIndex as number) >= segments.length) throw new CctError("invalid_segment_index");
    selectedIndex = root.selectedIndex as number;
    path = obj(obj(segments[selectedIndex]).path);
  }
  const cps = list(path.checkpoints);
  const identity = resolveIdentity(selectedIndex, path);
  if (identity.checkpointKeys.length !== cps.length) throw new CctError("route_identity_required");
  const nodes: Record<string, unknown>[] = [];
  const checkpoints = cps.map((item, index) => {
    const cp = obj(item), checkpointKey = cctText(identity.checkpointKeys[index]);
    for (const item of list(cp.rooms)) {
      const room = obj(item);
      if (nodes.length >= CCT_LIMITS.rooms) throw new CctError("route_file_too_large");
      nodes.push({ roomKey: room.debugRoomName, checkpointKey, groupedRooms: list(room.groupedRooms, true), isNonGameplayRoom: room.isNonGameplayRoom === undefined ? false : room.isNonGameplayRoom, customRoomName: room.customRoomName });
    }
    return { checkpointKey, name: cp.name, abbreviation: cp.abbreviation };
  });
  const route = parseCctRoute({ nodes, checkpoints, ignoredRooms: list(path.ignoredRooms, true), chapterSID: path.chapterSID, campaignName: path.campaignName, chapterName: path.chapterName, sideName: path.sideName });
  return { segmentKey: cctText(identity.segmentKey), selectedIndex, route, gameplayRoomCount: route.nodes.filter(n => !n.isNonGameplayRoom).length, identityStatus: "supplied" };
}

/** Untrusted search hints only. Never use these names to create or confirm a catalog binding. */
export function routeMatchHints(route: CctRoute, gameSid: string) {
  return { source: "cct_route" as const, sid: gameSid, sidStatus: route.chapterSID == null ? "unknown" : route.chapterSID === gameSid ? "matches" : "conflict", campaignName: route.campaignName ?? null, chapterName: route.chapterName ?? null, sideName: route.sideName ?? null };
}
export function routeRoomLabel(node: CctRoute["nodes"][number]) { return node.customRoomName ?? node.roomKey; }
export function routeCheckpointLabel(cp: NonNullable<CctRoute["checkpoints"]>[number]) { return cp.abbreviation ?? cp.name ?? cp.checkpointKey; }
