/**
 * 同步选择器层：读目录缓存。页面里的一次性取数都走这里，
 * 不要在组件里重复写 `catalog.value.maps.find(...)`。
 */
import { catalog } from "@/lib/catalog";
import type { Submission } from "@shared/types";

const byId = <T extends { id: number }>(items: T[]) => new Map(items.map((item) => [item.id, item]));

export const getCampaign = (id: number) => byId(catalog.value.campaigns).get(id);
export const getMap = (id: number) => byId(catalog.value.maps).get(id);
export const getChallenge = (id: number) => byId(catalog.value.challenges).get(id);
export const getMultiMapChallenge = (id: number) => byId(catalog.value.multiMapChallenges).get(id);
export const getPlayer = (id: number) => byId(catalog.value.players).get(id);

export const getCampaignMaps = (campaignId: number) => catalog.value.maps.filter((map) => map.campaignId === campaignId);
export const getCampaignHalls = (campaignId: number) => catalog.value.campaignHalls.filter((hall) => hall.campaignId === campaignId);
export const getCampaignMultiMapChallenges = (campaignId: number) => catalog.value.multiMapChallenges.filter((challenge) => challenge.campaignId === campaignId);
export const getMapChallenges = (mapId: number) => catalog.value.challenges.filter((challenge) => challenge.mapId === mapId);
export const getChallengeSubmissions = (challengeId: number) => catalog.value.submissions.filter((record) => record.challengeId === challengeId);
export const getPlayerSubmissions = (playerId: number) => catalog.value.submissions.filter((record) => record.playerId === playerId);

export const getMapSubmissions = (mapId: number) => {
  const seen = new Set<number>();
  const result: Submission[] = [];
  for (const challenge of getMapChallenges(mapId)) {
    for (const record of getChallengeSubmissions(challenge.id)) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      result.push(record);
    }
  }
  return result;
};
