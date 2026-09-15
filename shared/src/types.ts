export type TierCode =
  | "t-1"
  | "h0" | "m0" | "l0"
  | "h1" | "m1" | "l1"
  | "h2" | "m2" | "l2"
  | "h3" | "m3" | "l3"
  | "t4" | "t5" | "t6" | "t7";

export type StandardTier = "high-std" | "mid-std" | "low-std";
export type RatedTier = TierCode | StandardTier;
export type DifficultyCode = RatedTier | "undetermined";
export type SuggestionTier = DifficultyCode;

export type Campaign = {
  id: number;
  name: string;
  cnName?: string;
  shortName: string;
  author: string;
  url: string;
  goldenedCount: number;
  mapCount: number;
  blurb: string;
  notice?: string;
  banner?: string;
  bannerSource?: string;
  gameBananaUrl?: string;
  searchAliases?: string[];
};

export type MapItem = {
  id: number;
  campaignId?: number;
  name: string;
  cnName?: string;
  histStars?: number | null;
  histSubTier?: "lower" | "upper" | null;
  author: string;
  url: string;
  primaryTier: TierCode;
  recommendationPercent: number;
  rating: number;
  description: string;
  banner?: string;
  bannerSource?: string;
  notice?: string;
  searchAliases?: string[];
};

export type ChallengeType = "C" | "FC" | "C/FC" | "All Major Secrets" | "Silver Segment" | "Other";

export type Challenge = {
  id: number;
  mapId: number;
  name: string;
  type: ChallengeType;
  tier: DifficultyCode | null;
  clearCount: number;
  description: string;
  segment?: string;
  notice?: string;
};

export type MultiMapChallenge = {
  id: number;
  type?: ChallengeType;
  campaignId: number;
  name: string;
  tier: DifficultyCode;
  clearCount: number;
  description?: string;
  notice?: string;
};

export type Player = {
  id: number;
  name: string;
  bio?: string;
  bilibiliUid?: string;
  bilibiliUrl?: string;
  bilibiliUids?: string[];
  aliases?: string[];
  status?: "unasked" | "normal" | "unreplied" | "unwilling" | "blocked";
};

export type Submission = {
  id: number;
  challengeId: number;
  playerId: number;
  achievedAt: string;
  videoUrl: string;
  rawVideoUrl?: string;
  tags?: string[];
  note?: string;
  verifierNote?: string;
  reviewer?: string;
  reviewedAt?: string;
  duration?: string;
  status?: "pending" | "accepted" | "rejected" | "hidden";
  adminTags?: string[];
  opinionTier?: RatedTier;
  recommends?: boolean;
  alsoCountsFor?: string[];
  playerDisplayName?: string;
  inheritedFromChallengeId?: number;
};

export type SuggestionResponse = {
  player: string;
  progress: string;
  opinion: string;
  vote?: "FOR" | "AGAINST" | "INDIFFERENT";
  opinionTier?: SuggestionTier;
  comment?: string;
};

export type SuggestionState = "ONGOING" | "UNDECIDED" | "DECIDED";
export type SuggestionKind = "CHALLENGE" | "GENERAL" | "OWN COMPLETED CHALLENGES";

export type Suggestion = {
  id: number;
  title: string;
  kind: SuggestionKind;
  state: SuggestionState;
  source: string;
  challengeId?: number;
  mapId?: number;
  campaignId?: number;
  createdAt?: string;
  currentTier?: SuggestionTier;
  suggestedTier?: SuggestionTier;
  resultTier?: SuggestionTier;
  decision?: "ACCEPTED" | "REJECTED";
  decisionNote?: string;
  /** 投票截止时间（ISO）。历史导入记录没有，UI 按「创建时间 + 7 天」兜底。 */
  dueAt?: string;
  archiveVoteScope?: string;
  archiveVotes?: { completed: { yes: number; no: number; neutral: number }; notCompleted?: { yes: number; no: number; neutral: number } };
  body: string;
  author: string;
  postedAgo: string;
  timeLeft: string;
  votesFor: number;
  votesAgainst: number;
  responses: SuggestionResponse[];
};
/** 站点静态数据、运行时记录与页面组件共享的类型定义。 */

/** 地图包内的「大厅」分组，公开页按它排列地图。 */
export type CampaignHall = {
  id: number;
  campaignId: number;
  name: string;
  cnName?: string;
  aliases?: string[];
  color: string;
  order: number;
  mapIds?: number[];
};

export type PlayerStatus = "unasked" | "normal" | "unreplied" | "unwilling" | "blocked";
