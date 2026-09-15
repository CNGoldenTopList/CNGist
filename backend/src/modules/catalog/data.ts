/** 服务端目录加载器：一个请求内只查一次库，之后所有同步读（含 projection 的投影） */
import { context } from "../../plugins/http";
import { setCatalogCache, type CatalogData } from "./catalog-cache";

async function fetchCatalog() {
  const catalog = await import("./catalog");
  const overlayService = await import("./catalog-overlay");
  const [campaigns, maps, challenges, multiMapChallenges, players, submissions, suggestions, overlay] = await Promise.all([
    catalog.listCampaigns({ includeStandalone: true, skipStats: true }),
    catalog.listAllMaps(),
    catalog.listAllChallenges({ skipStats: true }),
    catalog.listMultiMapChallenges({ skipStats: true }),
    catalog.listPlayers(),
    catalog.listAllSubmissions(),
    catalog.listSuggestions(),
    overlayService.loadCatalogOverlay(),
  ]);
  const campaignIds = new Set(campaigns.map(c => c.id));
  const visibleMaps = maps.filter(m => campaignIds.has(m.campaignId!));
  const mapIds = new Set(visibleMaps.map(m => m.id));
  const visibleChallenges = challenges.filter(c => mapIds.has(c.mapId));
  const visibleMulti = multiMapChallenges.filter(c => campaignIds.has(c.campaignId));
  const challengeIds = new Set([...visibleChallenges, ...visibleMulti].map(c => c.id));
  const playerIds = new Set(players.map(p => p.id));
  const data: CatalogData = { campaigns, maps: visibleMaps, challenges: visibleChallenges, multiMapChallenges: visibleMulti, players,
    submissions: submissions.filter(s => challengeIds.has(s.challengeId) && playerIds.has(s.playerId) && !s.tags?.some(tag => tag.trim().toLowerCase() === "hidden")), suggestions, ...overlay,
    campaignHalls: overlay.campaignHalls.filter(h => campaignIds.has(h.campaignId)).map(h => ({ ...h, mapIds: (h.mapIds ?? []).filter(id => mapIds.has(id)) })),
    campaignOrders: Object.fromEntries(Object.entries(overlay.campaignOrders).filter(([id]) => campaignIds.has(Number(id))).map(([id, tokens]) => [id, tokens.filter(t => !t.startsWith("map:") || mapIds.has(Number(t.slice(4))))])),
    campaignMenu: { fixed: overlay.campaignMenu.fixed.filter(id => campaignIds.has(id)), favorites: overlay.campaignMenu.favorites.filter(id => campaignIds.has(id)) },
    challengeRelations: Object.fromEntries(Object.entries(overlay.challengeRelations).filter(([id]) => mapIds.has(Number(id))).map(([id, edges]) => [id, edges.filter(e => challengeIds.has(e.from) && challengeIds.has(e.to))])),
  };
  const campaignById = new Map(data.campaigns.map(c => [c.id, c]));
  const campaignByMap = new Map(data.maps.map(m => [m.id, m.campaignId!]));
  const campaignByChallenge = new Map(data.challenges.map(c => [c.id, campaignByMap.get(c.mapId)!]));
  const achievements = new Map<number, Set<string>>();
  for (const map of data.maps) campaignById.get(map.campaignId!)!.mapCount += 1;
  for (const record of data.submissions) {
    const campaignId = campaignByChallenge.get(record.challengeId);
    if (campaignId === undefined) continue;
    let keys = achievements.get(campaignId);
    if (!keys) achievements.set(campaignId, keys = new Set());
    keys.add(`${record.playerId}:${record.challengeId}`);
  }
  for (const campaign of data.campaigns) campaign.goldenedCount = achievements.get(campaign.id)?.size ?? 0;
  setCatalogCache(data);
  const { clearCount } = await import("./projection");
  for (const c of [...data.challenges, ...data.multiMapChallenges]) c.clearCount = clearCount(c.id);
  return data;
}

/** 确保缓存已填充（调用后同步选择器可读取本次请求的目录）。 */
export async function ensureCatalog() {
  await loadCatalog();
}

export function loadCatalog() {
  const cache = context().cache;
  if (!cache.has("catalogPromise")) cache.set("catalogPromise", fetchCatalog());
  return cache.get("catalogPromise") as Promise<CatalogData>;
}
