/** 公开数据的投影层：目录 → 页面要显示的东西。 */
import { getCatalogCache } from "./catalog-cache";
import type { Campaign, Challenge, MapItem, Submission } from "../../../../shared/src/types";
import { buildDefaultChallengeRelations, descendantsOf, preservesClearRecord, relationExists, type ChallengeRelation } from "../../../../shared/src/challenge-graph";
import type { AdminRecord, ReviewTag } from "../../../../shared/src/admin";

/** 后台视角的附加记录：待审核、被隐藏、以及带审核标签的已通过记录。 */
export type RecordOverlay = { records: AdminRecord[] };

const catalog = () => getCatalogCache();

export function projectedCampaigns(): Campaign[] { return catalog().campaigns; }

export function projectedMaps(): MapItem[] { return catalog().maps; }
export function projectedChallenges(): Challenge[] { return catalog().challenges; }

export function playerName(playerId: number) {
  return catalog().players.find((player) => player.id === playerId)?.name || playerId;
}

/** 每份请求目录只建立一次地图/挑战索引，并复用各地图的 DAG。 */
const directoryIndexes = new WeakMap<object, {
  challenges: Map<number, Challenge>;
  maps: Map<number, Challenge[]>;
  edges: Map<number, ChallengeRelation[]>;
}>();
function directoryIndex() {
  const data = catalog();
  let index = directoryIndexes.get(data);
  if (!index) {
    index = { challenges: new Map(), maps: new Map(), edges: new Map() };
    for (const challenge of data.challenges) {
      index.challenges.set(challenge.id, challenge);
      let group = index.maps.get(challenge.mapId);
      if (!group) index.maps.set(challenge.mapId, group = []);
      group.push(challenge);
    }
    directoryIndexes.set(data, index);
  }
  return index;
}

/** 某张图的 DAG：改过的用库里的边，没改过的按默认链现算。 */
export function relationsForMap(mapId: number, sourceChallenges = projectedChallenges()) {
  const stored = catalog().challengeRelations[mapId];
  if (stored) return stored;
  if (sourceChallenges !== projectedChallenges()) {
    return buildDefaultChallengeRelations(sourceChallenges.filter(item => item.mapId === mapId));
  }
  const index = directoryIndex();
  let edges = index.edges.get(mapId);
  if (!edges) {
    edges = buildDefaultChallengeRelations(index.maps.get(mapId) ?? []);
    index.edges.set(mapId, edges);
  }
  return edges;
}

function hasHiddenTag(tags: Array<string | ReviewTag> | undefined) {
  return Boolean(tags?.some((tag) => (typeof tag === "string" ? tag : tag.text).trim().toLowerCase() === "hidden"));
}

export function isExplicitFcChallenge(name: string) {
  return !/(?:^|[^a-z])C\s*\/\s*FC(?:[^a-z]|$)|(?:^|[^a-z])FC\s*\/\s*C(?:[^a-z]|$)/i.test(name)
    && /(?:^|[^a-z])FC(?:[^a-z]|$)/i.test(name);
}

function tagIdentity(tag: string) {
  return /^(?:FC|月莓|moon)$/i.test(tag.trim()) ? "fc" : tag.trim().toLocaleLowerCase();
}

function uniquePublicTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => { const key = tagIdentity(tag); if (!key || key === "raw" || seen.has(key)) return false; seen.add(key); return true; });
}

// FC 与 No Major Skips 可按挑战补标；DTS 只能来自记录配置。
function publicTagsForChallenge(name: string) {
  const tags: string[] = [];
  if (isExplicitFcChallenge(name)) tags.push("FC");
  if (/No\s+Major\s+Skips?/i.test(name)) tags.push("No Major Skips");
  return tags;
}

/*
 * 投影结果按目录版本缓存。目录一变（fetchCatalog 或后台命令后的重新拉取）整批作废；
 * overlay 每次刷新都是新对象，用 WeakMap 挂在它上面即可自然失效。
 */
type Bucket = {
  actual?: Submission[];
  maximal?: Submission[];
  maximalByChallenge?: Map<number, Array<{ record: Submission; position: number }>>;
  hidden?: Submission[];
  byChallenge: Map<number, Submission[]>;
};
const newBucket = (): Bucket => ({ byChallenge: new Map() });
const catalogBuckets = new WeakMap<object, { public: Bucket; overlays: WeakMap<RecordOverlay, Bucket> }>();
function bucket(overlay?: RecordOverlay): Bucket {
  const data = getCatalogCache();
  let state = catalogBuckets.get(data);
  if (!state) { state = { public: newBucket(), overlays: new WeakMap() }; catalogBuckets.set(data, state); }
  if (!overlay) return state.public;
  let entry = state.overlays.get(overlay);
  if (!entry) { entry = newBucket(); state.overlays.set(overlay, entry); }
  return entry;
}

/** 分组键用不可见分隔符，避免地图或玩家编号里出现的字符把键切错。 */
const GROUP_SEPARATOR = String.fromCharCode(0);

/** 目录里的已通过记录（挡掉隐藏标记），叠上 overlay 里已通过的那些。 */
function actualSubmissions(overlay?: RecordOverlay): Submission[] {
  const store = bucket(overlay);
  if (store.actual) return store.actual;
  const overlayIds = new Set(overlay?.records.map((record) => record.id) ?? []);
  const fromCatalog = catalog().submissions
    .filter((record) => !overlayIds.has(record.id) && record.status !== "hidden" && !hasHiddenTag(record.tags))
    .map((record) => ({ ...record, tags: uniquePublicTags(record.tags || []) }));
  const fromOverlay: Submission[] = (overlay?.records ?? [])
    .filter((record): record is AdminRecord & { challengeId: number } => record.challengeId !== null && record.status === "accepted" && !hasHiddenTag(record.reviewTags))
    .map((record) => ({
      id: record.id, challengeId: record.challengeId!, playerId: record.playerId, achievedAt: record.achievedAt,
      videoUrl: record.videoUrl, rawVideoUrl: record.rawVideoUrl,
      tags: uniquePublicTags((record.reviewTags || []).filter((tag) => (tag.kind === "badge" || tag.kind === "note")).map((tag) => tag.text)),
      verifierNote: record.verifierNote,
      note: record.playerNote, reviewer: record.reviewer, reviewedAt: record.reviewedAt, status: "accepted",
      recommends: record.recommends, opinionTier: record.opinionTier, duration: record.duration,
    }));
  store.actual = [...fromCatalog, ...fromOverlay];
  return store.actual;
}

/** 同玩家同挑战取最近达成记录；未知日期排后，ID 保证稳定，标签不跨记录拼接。 */
function uniqueAchievements(records: Submission[]) {
  const result = new Map<string, Submission>();
  for (const record of [...records].sort((a, b) => (b.achievedAt || "").localeCompare(a.achievedAt || "") || (b.reviewedAt || "").localeCompare(a.reviewedAt || "") || a.id - b.id)) {
    const key = `${record.playerId}${GROUP_SEPARATOR}${record.challengeId}`;
    if (!result.has(key)) result.set(key, record);
  }
  return [...result.values()];
}

/** 同图同人只留 DAG 上的极大元：被更高节点覆盖的记录不重复计入。 */
function maximalSubmissions(overlay?: RecordOverlay) {
  const store = bucket(overlay);
  if (store.maximal) return store.maximal;
  const sourceChallenges = projectedChallenges();
  const challengeById = directoryIndex().challenges;
  const groups = new Map<string, Submission[]>();
  const passthrough: Submission[] = [];
  for (const record of actualSubmissions(overlay)) {
    const mapId = challengeById.get(record.challengeId)?.mapId;
    if (!mapId) { passthrough.push(record); continue; }
    const key = `${mapId}${GROUP_SEPARATOR}${record.playerId}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    group.push(record);
  }
  const edgeCache = new Map<number, ChallengeRelation[]>();
  const result = [...passthrough];
  for (const [key, records] of groups) {
    const mapId = Number(key.split(GROUP_SEPARATOR, 1)[0]);
    const edges = edgeCache.get(mapId) || relationsForMap(mapId, sourceChallenges);
    edgeCache.set(mapId, edges);
    result.push(...records.filter((record) => !records.some((other) => other.id !== record.id && relationExists(record.challengeId, other.challengeId, edges) && !preservesClearRecord(challengeById.get(record.challengeId)!, challengeById.get(other.challengeId)!))));
  }
  store.maximal = result;
  return result;
}

/** 只读取相关挑战的成绩，按原投影顺序合并，避免每个挑战扫描全部记录。 */
function maximalForChallenges(ids: Set<number>, overlay?: RecordOverlay) {
  const store = bucket(overlay);
  if (!store.maximalByChallenge) {
    const index = new Map<number, Array<{ record: Submission; position: number }>>();
    maximalSubmissions(overlay).forEach((record, position) => {
      let group = index.get(record.challengeId);
      if (!group) index.set(record.challengeId, group = []);
      group.push({ record, position });
    });
    store.maximalByChallenge = index;
  }
  return [...ids].flatMap(id => store.maximalByChallenge!.get(id) ?? [])
    .sort((a, b) => a.position - b.position).map(item => item.record);
}

export function playerSubmissions(playerId: number, overlay?: RecordOverlay) {
  return uniqueAchievements(maximalSubmissions(overlay).filter((record) => record.playerId === playerId));
}

/** 被挡下的记录：目录里带 Hidden 的、overlay 里状态为隐藏的， */
function hiddenSubmissions(overlay?: RecordOverlay): Submission[] {
  const store = bucket(overlay);
  if (store.hidden) return store.hidden;
  const overlayIds = new Set(overlay?.records.map((record) => record.id) ?? []);
  const fromCatalog = catalog().submissions
    .filter((record) => !overlayIds.has(record.id) && (record.status === "hidden" || hasHiddenTag(record.tags)))
    .map((record) => ({ ...record, status: "hidden" as const, tags: Array.from(new Set([...(record.tags || []), "Hidden"])) }));
  const fromOverlay = (overlay?.records ?? [])
    .filter((record): record is AdminRecord & { challengeId: number } => record.challengeId !== null && record.status === "hidden" || hasHiddenTag(record.reviewTags))
    .map<Submission>((record) => ({
      id: record.id, challengeId: record.challengeId!, playerId: record.playerId, achievedAt: record.achievedAt,
      videoUrl: record.videoUrl, rawVideoUrl: record.rawVideoUrl, note: record.playerNote,
      verifierNote: record.verifierNote, reviewer: record.reviewer, reviewedAt: record.reviewedAt,
      status: "hidden", recommends: record.recommends, opinionTier: record.opinionTier, duration: record.duration,
      tags: uniquePublicTags([...(record.reviewTags || []).filter((tag) => (tag.kind === "badge" || tag.kind === "note")).map((tag) => tag.text), "Hidden"]),
    }));
  const maximalIds = new Set(maximalSubmissions(overlay).map((record) => `${record.playerId}${GROUP_SEPARATOR}${record.challengeId}`));
  const superseded = uniqueAchievements(actualSubmissions(overlay)).filter((record) => !maximalIds.has(`${record.playerId}${GROUP_SEPARATOR}${record.challengeId}`))
    .map((record) => ({ ...record, status: "hidden" as const, tags: Array.from(new Set([...(record.tags || []), "Hidden"])) }));
  store.hidden = Array.from(new Map([...fromCatalog, ...fromOverlay, ...superseded].map((record) => [record.id, record])).values());
  return store.hidden;
}

export function hiddenPlayerSubmissions(playerId: number, overlay?: RecordOverlay) {
  return hiddenSubmissions(overlay).filter((record) => record.playerId === playerId);
}

export function hiddenSubmissionsForChallenge(challengeId: number, overlay?: RecordOverlay) {
  const sourceChallenges = projectedChallenges();
  const target = directoryIndex().challenges.get(challengeId);
  if (!target) return hiddenSubmissions(overlay).filter((record) => record.challengeId === challengeId);
  const eligible = new Set([challengeId, ...descendantsOf(challengeId, relationsForMap(target.mapId, sourceChallenges))]);
  return hiddenSubmissions(overlay).filter((record) => eligible.has(record.challengeId))
    .map((record) => ({ ...record, challengeId, inheritedFromChallengeId: record.challengeId === challengeId ? undefined : record.challengeId }));
}

/** 某个挑战的记录：含 DAG 下游继承过来的，继承来的不带推荐与意见分。 */
export function submissionsForChallenge(challengeId: number, overlay?: RecordOverlay) {
  const store = bucket(overlay);
  const cached = store.byChallenge.get(challengeId);
  if (cached) return cached;
  const sourceChallenges = projectedChallenges();
  const target = directoryIndex().challenges.get(challengeId);
  if (!target) {
    const direct = maximalForChallenges(new Set([challengeId]), overlay);
    store.byChallenge.set(challengeId, direct);
    return direct;
  }
  const edges = relationsForMap(target.mapId, sourceChallenges);
  const eligible = new Set([challengeId, ...descendantsOf(challengeId, edges)]);
  const result = maximalForChallenges(eligible, overlay).map((record) => {
    const inherited = record.challengeId !== challengeId;
    const source = directoryIndex().challenges.get(record.challengeId);
    return {
      ...record,
      challengeId,
      inheritedFromChallengeId: inherited ? record.challengeId : undefined,
      recommends: inherited ? undefined : record.recommends,
      opinionTier: inherited ? undefined : record.opinionTier,
      tags: uniquePublicTags([...(record.tags || []), ...publicTagsForChallenge(source?.name || "")]),
    };
  });
  // 有直接记录时不再附加同玩家的继承记录；同挑战的多次达成全部展示。
  const directPlayers = new Set(result.filter(record => !record.inheritedFromChallengeId).map(record => record.playerId));
  const visible = result.filter(record => !record.inheritedFromChallengeId || !directPlayers.has(record.playerId));
  store.byChallenge.set(challengeId, visible);
  return visible;
}

export function clearCount(challengeId: number, overlay?: RecordOverlay) {
  return new Set(submissionsForChallenge(challengeId, overlay).map((record) => record.playerId)).size;
}

/** 挑战所属的地图与地图包，找不到时退回带编号的标签。 */
export function challengeContext(challengeId: number) {
  const challenge = projectedChallenges().find((item) => item.id === challengeId);
  const map = challenge ? projectedMaps().find((item) => item.id === challenge.mapId) : undefined;
  const multiChallenge = catalog().multiMapChallenges.find((item) => item.id === challengeId);
  const campaigns = projectedCampaigns();
  const campaign = multiChallenge
    ? campaigns.find((item) => item.id === multiChallenge.campaignId)
    : map?.campaignId ? campaigns.find((item) => item.id === map.campaignId) : undefined;
  return {
    challenge, map, multiChallenge, campaign,
    label: [map?.name || campaign?.name, challenge?.name || multiChallenge?.name].filter(Boolean).join(" · ") || challengeId,
  };
}
