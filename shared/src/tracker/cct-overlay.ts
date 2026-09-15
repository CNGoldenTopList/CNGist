/** 把只读投影折算成 CCT 游戏内文字覆盖层的那几行。 */
import type { CctProjection, GoldenNode, RoomProjection } from "./cct-projection";

export type GoldenRoomFigures = {
  /** E(r) */
  entries: number;
  /** S(r) */
  successes: number;
  /** S(r)/E(r)。没有进入记录时为 null，不能显示成 0%。 */
  successRate: number | null;
  /** E(r)/T */
  entryChance: number | null;
  /** CCT 的「局」：这是第几次带金进入该房间。 */
  runNumber: number;
};

export type RoomOverlay = {
  roomKey: string;
  displayName: string;
  /** 路线里的第几个房间，从 1 起；不在路线上或没有路线时为 null。 */
  position: number | null;
  routeLength: number | null;
  currentStreak: number;
  bestStreak: number;
  /** 玩家自己的 CCT 窗口内的通过率，没有样本时为 null。 */
  windowRate: number | null;
  windowSamples: number;
  windowSuccesses: number;
  golden: GoldenRoomFigures | null;
  goldenSession: GoldenRoomFigures | null;
};

export type ChapterOverlay = {
  /** T = 带金死亡 + 已完成 */
  runs: number;
  collected: number;
  deaths: number;
  /** 已完成 / T。没有一局跑完过时是真的 0%，与「没有样本」不同。 */
  clearRate: number | null;
  runsSession: number;
  collectedSession: number;
};

const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);

/** 路线节点会把若干房间并成一个，所以按 members 找，不能只比 roomKey。 */
function nodeFor(nodes: GoldenNode[] | undefined, roomKey: string) {
  return nodes?.find((node) => node.members.includes(roomKey));
}

function figuresOf(node: GoldenNode | undefined): GoldenRoomFigures | null {
  if (!node) return null;
  return {
    entries: node.estimatedEntries,
    successes: node.estimatedPasses,
    successRate: node.passRate,
    entryChance: node.entryRate,
    runNumber: node.estimatedEntries + 1,
  };
}

function roomOf(rooms: RoomProjection[], roomKey: string) {
  return rooms.find((room) => room.roomKey === roomKey);
}

/** 某个房间的覆盖层读数。房间既不在统计里也不在路线上时返回 null —— */
export function roomOverlay(projection: CctProjection, roomKey: string): RoomOverlay | null {
  const room = roomOf(projection.rooms, roomKey);
  const node = nodeFor(projection.golden?.nodes, roomKey);
  if (!room && !node) return null;
  const nodes = projection.golden?.nodes;
  return {
    roomKey,
    displayName: node?.displayName ?? room?.displayName ?? roomKey,
    position: node ? node.position + 1 : null,
    routeLength: nodes ? nodes.length : null,
    currentStreak: room?.currentStreak ?? 0,
    bestStreak: room?.bestStreak ?? 0,
    windowRate: room?.rate ?? null,
    windowSamples: room?.sampleCount ?? 0,
    windowSuccesses: room?.successes ?? 0,
    golden: figuresOf(node),
    goldenSession: figuresOf(nodeFor(projection.goldenSession?.nodes, roomKey)),
  };
}

export type RoomRow = {
  roomKey: string;
  displayName: string;
  /** 路线里的第几个房间，从 1 起；不在路线上为 null。 */
  position: number | null;
  isNonGameplayRoom: boolean;
  /** 玩家 CCT 窗口内的练习通过率与样本。 */
  windowRate: number | null;
  windowSamples: number;
  windowSuccesses: number;
  bestStreak: number;
  /** 该房间自己的持金死亡数，不并入路线节点。 */
  goldenDeaths: number;
  /** 以下几项没有路线就没有分母，一律 null。 */
  entries: number | null;
  successes: number | null;
  entryChance: number | null;
  goldenRate: number | null;
};

/** 全部已上传房间的一览。路线顺序在前、路线外的房间按 key 跟在后面 —— */
export function roomTable(projection: CctProjection): RoomRow[] {
  const byRoom = new Map<string, GoldenNode>();
  for (const node of projection.golden?.nodes ?? []) {
    for (const member of node.members) byRoom.set(member, node);
  }
  return projection.rooms.map((room) => {
    const node = byRoom.get(room.roomKey);
    return {
      roomKey: room.roomKey,
      displayName: node?.displayName ?? room.displayName,
      position: node ? node.position + 1 : null,
      isNonGameplayRoom: room.isNonGameplayRoom,
      windowRate: room.rate,
      windowSamples: room.sampleCount,
      windowSuccesses: room.successes,
      bestStreak: room.bestStreak,
      goldenDeaths: room.goldenBerryDeaths,
      entries: node?.estimatedEntries ?? null,
      successes: node?.estimatedPasses ?? null,
      entryChance: node?.entryRate ?? null,
      goldenRate: node?.passRate ?? null,
    };
  });
}

/** 地图级汇总。没有路线就没有 T，返回 null。 */
export function chapterOverlay(projection: CctProjection): ChapterOverlay | null {
  const golden = projection.golden;
  if (!golden) return null;
  return {
    runs: golden.total,
    collected: golden.collected,
    deaths: golden.routeDeaths,
    clearRate: ratio(golden.collected, golden.total),
    runsSession: projection.goldenSession?.total ?? 0,
    collectedSession: projection.goldenSession?.collected ?? 0,
  };
}
