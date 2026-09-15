import { context } from "../../plugins/http";
/** 目录缓存状态。只放纯数据，不引任何服务端依赖——客户端与服务端共用。 */
import type { Campaign, CampaignHall, Challenge, MapItem, MultiMapChallenge, Player, Submission, Suggestion } from "../../../../shared/src/types";
import type { ChallengeRelation } from "../../../../shared/src/challenge-graph";

export type { CatalogData } from "../../../../shared/src/catalog";
import type { CatalogData } from "../../../../shared/src/catalog";
export function setCatalogCache(data: CatalogData) { context().cache.set("catalog", data); }
export function getCatalogCache(): CatalogData {
  const data = context().cache.get("catalog") as CatalogData | undefined;
  if (!data) throw new Error("读取投影前必须加载目录");
  return data;
}
export function getCatalogVersion() { return getCatalogCache(); }
export function hasCatalogCache() { return context().cache.has("catalog"); }
