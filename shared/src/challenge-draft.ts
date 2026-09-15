import type { DifficultyCode } from "./types";
export type ChallengeDraft = {
  campaignId: number | null; mapId: number | null;
  campaignName: string; mapName: string; challengeName: string;
  gameBananaUrl: string; type: string | null; tier: DifficultyCode | null; rules: string;
};
export type ChallengeDraftPreview = {
  token: string; draft: ChallengeDraft; notes: string[];
  sourceUrl?: string; sourceDifficulty?: string; sourceObjective?: string;
  sourceMapNames: string[];
};
