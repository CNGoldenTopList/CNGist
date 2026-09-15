import { isStandardTier } from "./tiers";
import type { CatalogData } from "./catalog";
import { challengeDisplayName, compareChallengeNames } from "./labels";

export type ChallengeSelection = { scope: 'map' | 'campaign'; campaignId: number | null; mapId: number | null; challengeId: number | null };
export const emptyChallengeSelection: ChallengeSelection = { scope: 'map', campaignId: null, mapId: null, challengeId: null };
type Catalog = Pick<CatalogData, 'campaigns' | 'maps' | 'challenges' | 'multiMapChallenges'>;

/** IDs are authoritative; an upstream change or catalog refresh cannot retain an unrelated target. */
export function challengeSelectionOptions(catalog: Catalog, value: ChallengeSelection, mapOnly = false, excludeStandard = false) {
  const scope = mapOnly ? 'map' : value.scope;
  const campaignIds = new Set((scope === 'campaign' ? catalog.multiMapChallenges : catalog.maps).map(item => item.campaignId));
  const campaigns = catalog.campaigns.filter(item => campaignIds.has(item.id));
  const campaignId = campaigns.some(item => item.id === value.campaignId) ? value.campaignId : null;
  const maps = catalog.maps.filter(item => item.campaignId === campaignId);
  const mapId = scope === 'map' && maps.some(item => item.id === value.mapId) ? value.mapId : null;
  const challenges = (scope === 'campaign'
    ? catalog.multiMapChallenges.filter(item => item.campaignId === campaignId)
    : catalog.challenges.filter(item => item.mapId === mapId))
    .filter(item => !excludeStandard || !isStandardTier(item.tier)).sort((a, b) => compareChallengeNames(challengeDisplayName(a), challengeDisplayName(b)) || a.id - b.id);
  const challengeId = !mapOnly && challenges.some(item => item.id === value.challengeId) ? value.challengeId : null;
  return { campaigns, maps, challenges, value: { scope, campaignId, mapId, challengeId } };
}

/** Resolve a submission deep link using catalog IDs, including campaign-scoped challenges. */
export function challengeSelectionFromId(catalog: Catalog, challengeId: number | null): ChallengeSelection {
  const target = catalog.challenges.find(item => item.id === challengeId);
  const map = target && catalog.maps.find(item => item.id === target.mapId);
  const multi = catalog.multiMapChallenges.find(item => item.id === challengeId);
  const value: ChallengeSelection = map?.campaignId && target
    ? { scope: 'map', campaignId: map.campaignId, mapId: map.id, challengeId: target.id }
    : multi ? { scope: 'campaign', campaignId: multi.campaignId, mapId: null, challengeId: multi.id }
    : emptyChallengeSelection;
  return challengeSelectionOptions(catalog, value).value;
}
