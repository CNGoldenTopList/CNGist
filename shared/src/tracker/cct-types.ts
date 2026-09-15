/**
 * CCT 同步协议的数据形状，以及只读的窗口读数。
 *
 * 放在 shared 而不是后端：愿望单页要把同一份投影渲染成游戏内覆盖层那几行，
 * 前端不引用后端模块，这些定义又必须两边完全一致 —— 抄两份必然会分叉。
 * 解析与校验（会抛错、会用 node:crypto）留在后端，不进这里。
 */
export const CCT_LIMITS = { attempts: 100, rooms: 2000, scopeBytes: 8 * 1024 * 1024, scopesPerAccount: 1000 } as const;
export type CctRoom = {
  roomKey: string;
  previousAttempts: boolean[];
  successStreak: number;
  successStreakBest: number;
  goldenBerryDeaths: number;
  goldenBerryDeathsSession: number;
  deathsInCurrentRun: number;
};
export type CctRouteNode = { roomKey: string; checkpointKey: string; groupedRooms: string[]; isNonGameplayRoom: boolean; customRoomName: string | null };
export type CctRoute = {
  nodes: CctRouteNode[];
  ignoredRooms: string[];
  chapterSID: string | null;
  campaignName: string | null;
  chapterName: string | null;
  sideName: string | null;
  checkpoints: { checkpointKey: string; name: string | null; abbreviation: string | null }[];
};
export type CctMetadata = {
  cctVersion: string;
  adapterVersion: string;
  cctSessionKey: string;
  settings: { trackNegativeStreaks: boolean; selectedAttemptCount: number };
  chapter: { goldenCollectedCount: number; goldenCollectedCountSession: number };
  route: CctRoute | null;
};
export type CctState = { metadata: CctMetadata; rooms: CctRoom[] };
export type CctScope = { datasetId: string; sid: string; side: "Normal" | "BSide" | "CSide"; segmentKey: string };

export function roomWindow(room: CctRoom, size: 5 | 10 | 20 | 100 = 20) {
  const samples = room.previousAttempts.slice(-size);
  const successes = samples.filter(Boolean).length;
  return { sampleCount: samples.length, successes, rate: samples.length ? successes / samples.length : null, currentStreak: room.successStreak, bestStreak: room.successStreakBest };
}
