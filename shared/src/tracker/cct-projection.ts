import { roomWindow } from "./cct-types";
import type { CctMetadata, CctRoom, CctRoute, CctState } from "./cct-types";

/** Read-only display projections over one mirrored CCT scope. */

export type AttemptWindow = 5 | 10 | 20 | 100;
export type GoldenScale = "total" | "session";

export type RoomProjection = {
  roomKey: string;
  /** customRoomName -> roomKey, per the route display rule. Always plain text. */
  displayName: string;
  inRoute: boolean;
  isNonGameplayRoom: boolean;
  sampleCount: number;
  successes: number;
  /** null when the window holds no sample. CCT would report 0 here. */
  rate: number | null;
  currentStreak: number;
  bestStreak: number;
  goldenBerryDeaths: number;
  goldenBerryDeathsSession: number;
};

export type GoldenNode = {
  roomKey: string;
  displayName: string;
  checkpointKey: string;
  /** abbreviation -> name -> checkpointKey, per the route display rule. */
  checkpointLabel: string;
  isNonGameplayRoom: boolean;
  /** Rooms folded into this node: its own key plus CCT's grouped rooms. */
  members: string[];
  position: number;
  /** D(r) */
  deaths: number;
  /** E(r) = D(r) + A(r) + W */
  estimatedEntries: number;
  /** S(r) = A(r) + W */
  estimatedPasses: number;
  /** E(r)/T */
  entryRate: number | null;
  /** S(r)/E(r) */
  passRate: number | null;
  /** D(r)/E(r); complements passRate */
  chokeRate: number | null;
};

export type GoldenAggregate = {
  scale: GoldenScale;
  /** W */
  collected: number;
  /** Route-aggregated golden deaths */
  routeDeaths: number;
  /** T = routeDeaths + W */
  total: number;
  nodes: GoldenNode[];
  /** Rooms the route passes again later; their deaths are attributed to the first pass. */
  revisitedRooms: string[];
};

type RouteEntry = Pick<GoldenNode, "roomKey" | "displayName" | "checkpointKey" | "checkpointLabel" | "isNonGameplayRoom" | "members">;
type Route = { entries: RouteEntry[]; revisitedRooms: string[] };

function compareKeys(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function ratio(numerator: number, denominator: number) { return denominator > 0 ? numerator / denominator : null; }

function checkpointLabels(route: CctRoute) {
  return new Map(route.checkpoints.map(cp => [cp.checkpointKey, cp.abbreviation ?? cp.name ?? cp.checkpointKey]));
}

function readRoute(metadata: CctMetadata): Route | null {
  const route = metadata.route;
  if (!route) return null;
  const ignored = new Set(route.ignoredRooms), seen = new Set<string>();
  const labels = checkpointLabels(route);
  const entries: RouteEntry[] = [], revisitedRooms: string[] = [];
  for (const node of route.nodes) {
    if (ignored.has(node.roomKey)) continue;
    if (seen.has(node.roomKey)) { revisitedRooms.push(node.roomKey); continue; }
    const members = [node.roomKey, ...node.groupedRooms].filter(key => !ignored.has(key) && !seen.has(key));
    for (const key of members) seen.add(key);
    entries.push({
      roomKey: node.roomKey, displayName: node.customRoomName ?? node.roomKey,
      checkpointKey: node.checkpointKey, checkpointLabel: labels.get(node.checkpointKey) ?? node.checkpointKey,
      isNonGameplayRoom: node.isNonGameplayRoom, members,
    });
  }
  return { entries, revisitedRooms };
}

/** Route position per room key, the display name it should carry, and the non-gameplay marks. */
function routeIndex(route: Route | null) {
  const position = new Map<string, number>(), nonGameplay = new Set<string>(), names = new Map<string, string>();
  let next = 0;
  for (const entry of route?.entries ?? []) {
    for (const key of entry.members) {
      if (!position.has(key)) position.set(key, next++);
      if (entry.isNonGameplayRoom) nonGameplay.add(key);
      // Only the node's own room carries customRoomName; grouped members keep their key.
      if (key === entry.roomKey) names.set(key, entry.displayName);
    }
  }
  return { position, nonGameplay, names };
}

function goldenDeaths(room: CctRoom | undefined, scale: GoldenScale) {
  if (!room) return 0;
  return scale === "session" ? room.goldenBerryDeathsSession : room.goldenBerryDeaths;
}

/** The player's own CCT window setting; parseCctMetadata already restricted it to 5/10/20/100. */
export function defaultWindow(state: CctState): AttemptWindow {
  return state.metadata.settings.selectedAttemptCount as AttemptWindow;
}

/** Rooms in route order, then rooms the route does not cover, by key. */
export function projectRooms(state: CctState, window: AttemptWindow = defaultWindow(state)): RoomProjection[] {
  const { position, nonGameplay, names } = routeIndex(readRoute(state.metadata));
  return state.rooms.map(room => {
    const stats = roomWindow(room, window);
    return {
      roomKey: room.roomKey,
      displayName: names.get(room.roomKey) ?? room.roomKey,
      inRoute: position.has(room.roomKey),
      isNonGameplayRoom: nonGameplay.has(room.roomKey),
      sampleCount: stats.sampleCount, successes: stats.successes, rate: stats.rate,
      currentStreak: stats.currentStreak, bestStreak: stats.bestStreak,
      goldenBerryDeaths: room.goldenBerryDeaths, goldenBerryDeathsSession: room.goldenBerryDeathsSession,
    };
  }).sort((a, b) => {
    const left = position.get(a.roomKey), right = position.get(b.roomKey);
    if (left === undefined || right === undefined) {
      if (left !== right) return left === undefined ? 1 : -1;
      return compareKeys(a.roomKey, b.roomKey);
    }
    return left - right;
  });
}

/** CCT-compatible golden rates derived from route order and per-room golden deaths. */
export function projectGolden(state: CctState, scale: GoldenScale = "total"): GoldenAggregate | null {
  const route = readRoute(state.metadata);
  if (!route) return null;
  const rooms = new Map(state.rooms.map(room => [room.roomKey, room]));
  const chapter = state.metadata.chapter;
  const collected = scale === "session" ? chapter.goldenCollectedCountSession : chapter.goldenCollectedCount;
  const deaths = route.entries.map(entry => entry.members.reduce((sum, key) => sum + goldenDeaths(rooms.get(key), scale), 0));
  const routeDeaths = deaths.reduce((sum, value) => sum + value, 0);
  const total = routeDeaths + collected;
  const nodes: GoldenNode[] = [];
  let after = 0;
  for (let index = route.entries.length - 1; index >= 0; index--) {
    const own = deaths[index];
    const estimatedPasses = after + collected;
    const estimatedEntries = own + estimatedPasses;
    nodes.push({
      ...route.entries[index], position: index, deaths: own, estimatedEntries, estimatedPasses,
      entryRate: ratio(estimatedEntries, total),
      passRate: ratio(estimatedPasses, estimatedEntries),
      chokeRate: ratio(own, estimatedEntries),
    });
    after += own;
  }
  nodes.reverse();
  return { scale, collected, routeDeaths, total, nodes, revisitedRooms: route.revisitedRooms };
}

/** Lowest window rate first. Rooms below minSamples are withheld rather than ranked on thin data. */
export function hardestRooms(rooms: RoomProjection[], { limit = 5, minSamples = 5 } = {}) {
  return rooms
    .filter(room => !room.isNonGameplayRoom && room.rate !== null && room.sampleCount >= minSamples)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || b.sampleCount - a.sampleCount || compareKeys(a.roomKey, b.roomKey))
    .slice(0, limit);
}

/** Highest choke rate first, over nodes with enough estimated golden entries to mean anything. */
export function chokePoints(golden: GoldenAggregate | null, { limit = 5, minEntries = 5 } = {}) {
  if (!golden) return [];
  return golden.nodes
    .filter(node => !node.isNonGameplayRoom && node.chokeRate !== null && node.estimatedEntries >= minEntries)
    .sort((a, b) => (b.chokeRate ?? 0) - (a.chokeRate ?? 0) || b.deaths - a.deaths || compareKeys(a.roomKey, b.roomKey))
    .slice(0, limit);
}

/** The "倒一": last route room that is actually played, excluding results and cutscene nodes. */
export function lastGameplayRoom(state: CctState): string | null {
  const route = readRoute(state.metadata);
  if (!route) return null;
  for (let index = route.entries.length - 1; index >= 0; index--) {
    if (!route.entries[index].isNonGameplayRoom) return route.entries[index].displayName;
  }
  return null;
}

export type CctProjection = {
  window: AttemptWindow;
  rooms: RoomProjection[];
  hardest: RoomProjection[];
  golden: GoldenAggregate | null;
  goldenSession: GoldenAggregate | null;
  chokes: GoldenNode[];
  lastGameplayRoom: string | null;
};

export function projectCct(state: CctState, options: { window?: AttemptWindow; limit?: number; minSamples?: number; minEntries?: number } = {}): CctProjection {
  const window = options.window ?? defaultWindow(state);
  const rooms = projectRooms(state, window);
  const golden = projectGolden(state, "total");
  return {
    window, rooms,
    hardest: hardestRooms(rooms, { limit: options.limit, minSamples: options.minSamples }),
    golden, goldenSession: projectGolden(state, "session"),
    chokes: chokePoints(golden, { limit: options.limit, minEntries: options.minEntries }),
    lastGameplayRoom: lastGameplayRoom(state),
  };
}
