/** 页面所需的公开查询均通过后端投影返回。 */
import { jsonResponse, requestUrl, type ApiRequest } from "../../plugins/http";
import { loadCatalog } from "./data";
import { getSiteStats } from "./catalog";
import { playerSubmissions, submissionsForChallenge, clearCount, relationsForMap } from "./projection";
import { pathEntityId } from "../../../../shared/src/entity-id";
import { readQaEntries } from "../qa/qa-service";
import { farewellGoldenRecords } from "./farewell";
import { resolveMapBindings } from "../tracker/tracker-map-binding-service";
const missing = () => jsonResponse({ ok: false, error: "not_found" }, { status: 404 });
export async function campaigns() { return jsonResponse({ campaigns: (await loadCatalog()).campaigns }); }
export async function maps() { return jsonResponse({ maps: (await loadCatalog()).maps }); }
export async function players() { return jsonResponse({ players: (await loadCatalog()).players }); }
export async function challenges() { const c = await loadCatalog(); return jsonResponse({ challenges: c.challenges, multiMapChallenges: c.multiMapChallenges }); }
export async function campaign(request: ApiRequest) {
  const c = await loadCatalog(), id = pathEntityId(request.params.id);
  const campaign = c.campaigns.find(x => x.id === id); if (!campaign) return missing();
  return jsonResponse({ campaign, maps: c.maps.filter(x => x.campaignId === id), challenges: c.multiMapChallenges.filter(x => x.campaignId === id), halls: c.campaignHalls.filter(x => x.campaignId === id), order: c.campaignOrders[id] ?? [] });
}
export async function map(request: ApiRequest) {
  const c = await loadCatalog(), id = pathEntityId(request.params.id);
  const map = c.maps.find(x => x.id === id); if (!map) return missing();
  return jsonResponse({ map, campaign: c.campaigns.find(x => x.id === map.campaignId), challenges: c.challenges.filter(x => x.mapId === id), relations: relationsForMap(id) });
}
export async function challenge(request: ApiRequest) {
  const c = await loadCatalog(), id = pathEntityId(request.params.id);
  const mapChallenge = c.challenges.find(x => x.id === id), campaignChallenge = c.multiMapChallenges.find(x => x.id === id);
  if (!mapChallenge && !campaignChallenge) return missing();
  return jsonResponse({ scope: mapChallenge ? "map" : "campaign", challenge: mapChallenge ?? campaignChallenge, records: submissionsForChallenge(id), clearCount: clearCount(id) });
}
export async function player(request: ApiRequest) {
  const c = await loadCatalog(), id = pathEntityId(request.params.id);
  const player = c.players.find(x => x.id === id); if (!player) return missing();
  return jsonResponse({ player, records: playerSubmissions(id) });
}
export async function records(request: ApiRequest) {
  const c = await loadCatalog(), url = requestUrl(request);
  let records = c.submissions;
  if (url.searchParams.has("challengeId")) records = submissionsForChallenge(pathEntityId(url.searchParams.get("challengeId")!));
  if (url.searchParams.has("playerId")) records = records.filter(r => r.playerId === pathEntityId(url.searchParams.get("playerId")!));
  return jsonResponse({ records });
}
export async function record(request: ApiRequest) { const c = await loadCatalog(); const record = c.submissions.find(r => r.id === pathEntityId(request.params.id)); return record ? jsonResponse({ record }) : missing(); }
export async function stats() {
  return jsonResponse(await getSiteStats());
}
export async function suggestions() { return jsonResponse({ suggestions: (await loadCatalog()).suggestions }); }
export async function qa() { return jsonResponse({ entries: await readQaEntries() }); }
export async function farewell() {
  await loadCatalog();
  /* 第九章在游戏里的 SID 是 Celeste/LostLevels，不是章节号 —— 章节号那一串
     在配对表里根本不存在，按它查永远是空列表。 */
  const match = (await resolveMapBindings([{ sid: "Celeste/LostLevels", side: "Normal" }]))[0];
  return jsonResponse({ records: match ? farewellGoldenRecords(match.mapId) : [] });
}
