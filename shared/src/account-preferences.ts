/** 可随账户漫游的界面偏好。放在独立文件，避免 schema 反向依赖客户端组件。 */
export type AccountPreferences = {
  nameMode?: "cn" | "both" | "en";
  onlyOfficialChinese?: boolean;
  compactTierLabels?: boolean;
  showHistRatings?: boolean;
  showStandardChallenges?: boolean;
  tierColorsV2?: Record<string, string>;
  favoriteCampaignIds?: number[];
  adminMode?: boolean;
};

export type PlayerStatus = "unasked" | "normal" | "unreplied" | "unwilling" | "blocked";
