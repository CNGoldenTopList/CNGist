import type { Campaign, CampaignHall, Challenge, MapItem, MultiMapChallenge, Player, Submission, Suggestion } from "./types";
import type { ChallengeRelation } from "./challenge-graph";
export type CatalogData = {
  campaigns: Campaign[];
  maps: MapItem[];
  /** 地图挑战（scope=map）。 */
  challenges: Challenge[];
  multiMapChallenges: MultiMapChallenge[];
  players: Player[];
  submissions: Submission[];
  suggestions: Suggestion[];
  /** 地图包内的大厅分组。 */
  campaignHalls: CampaignHall[];
  /** 地图包内根层的排列顺序，元素是 `map:<id>` 或 `hall:<id>`。 */
  campaignOrders: Record<string, string[]>;
  /** 挑战 DAG。只包含**改过默认链**的地图；其余地图在读取时按默认链现算， */
  challengeRelations: Record<string, ChallengeRelation[]>;
  /** 顶栏地图包菜单。 */
  campaignMenu: { fixed: number[]; favorites: number[] };
};
