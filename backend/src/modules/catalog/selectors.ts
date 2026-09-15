/** 同步选择器层：读目录缓存。 */
import { getCatalogCache } from "./catalog-cache";
import type { Challenge, MapItem, MultiMapChallenge, Submission } from "../../../../shared/src/types";
import { formatDate } from "../../../../shared/src/datetime";
import { hardestTier } from "../../../../shared/src/tiers";

const campaignById = () => new Map(getCatalogCache().campaigns.map((x) => [x.id, x]));
const mapById = () => new Map(getCatalogCache().maps.map((x) => [x.id, x]));
const challengeById = () => new Map(getCatalogCache().challenges.map((x) => [x.id, x]));
const multiChallengeById = () => new Map(getCatalogCache().multiMapChallenges.map((x) => [x.id, x]));
const playerById = () => new Map(getCatalogCache().players.map((x) => [x.id, x]));

export const getCampaign = (id: number) => campaignById().get(id);
export const getMap = (id: number) => mapById().get(id);
export const getChallenge = (id: number) => challengeById().get(id);
export const getMultiMapChallenge = (id: number) => multiChallengeById().get(id);
export const getPlayer = (id: number) => playerById().get(id);

export const getCampaignMaps = (campaignId: number) => getCatalogCache().maps.filter((m) => m.campaignId === campaignId);
export const getCampaignMultiMapChallenges = (campaignId: number) => getCatalogCache().multiMapChallenges.filter((c) => c.campaignId === campaignId);
export const getMapChallenges = (mapId: number) => getCatalogCache().challenges.filter((c) => c.mapId === mapId);
export const getChallengeSubmissions = (challengeId: number) => getCatalogCache().submissions.filter((s) => s.challengeId === challengeId);
export const getMultiMapChallengeSubmissions = getChallengeSubmissions;
export const getMapSubmissions = (mapId: number) => {
  const seen = new Set<number>(); const result: Submission[] = [];
  for (const challenge of getMapChallenges(mapId)) {
    for (const submission of getChallengeSubmissions(challenge.id)) {
      if (seen.has(submission.id)) continue;
      seen.add(submission.id); result.push(submission);
    }
  }
  return result;
};
export const getPlayerSubmissions = (playerId: number) => getCatalogCache().submissions.filter((s) => s.playerId === playerId);

export type { Challenge, MapItem, MultiMapChallenge };
export { formatDate, hardestTier };
