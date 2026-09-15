/**
 * 公开数据的投影层：目录 → 页面要显示的东西。
 *
 * 挑战 DAG 的继承与去重、隐藏记录、公开标签都在这里；后端做过同样一遍，
 * 但按挑战／按玩家逐个请求在金榜矩阵那种页面上要发几百次，所以整表计算
 * 仍然留在前端，读的是同一份 `/api/catalog`。
 *
 * 后台要额外看到待审核与隐藏记录时传 overlay（来自 /api/admin/submissions）。
 * **不传就是公开视角**，这是公开页唯一该用的调用方式。
 */
import { catalog } from "@/lib/catalog";
import type { AdminRecord, ReviewTag } from "@shared/admin";
import type { Campaign, Challenge, MapItem, Submission } from "@shared/types";
import {
  buildDefaultChallengeRelations, descendantsOf, preservesClearRecord, relationExists,
  type ChallengeRelation,
} from "@shared/challenge-graph";

/**
 * 后台视角的附加记录：待审核、被隐藏、以及带审核标签的已通过记录。
 * 类型直接用 shared 的那一份 —— 前端另定一套迟早与服务端分叉。
 */
export type { AdminRecord, ReviewTag } from "@shared/admin";
export type RecordOverlay = { records: AdminRecord[] };

export const projectedCampaigns = (): Campaign[] => catalog.value.campaigns;
export const projectedMaps = (): MapItem[] => catalog.value.maps;
export const projectedChallenges = (): Challenge[] => catalog.value.challenges;

export function playerName(playerId: number) {
  return catalog.value.players.find((player) => player.id === playerId)?.name || String(playerId);
}

/** 某张图的 DAG：改过的用库里的边，没改过的按默认链现算。 */
export function relationsForMap(mapId: number, sourceChallenges = projectedChallenges()) {
  const stored = catalog.value.challengeRelations[String(mapId)];
  if (stored) return stored;
  return buildDefaultChallengeRelations(sourceChallenges.filter((item) => item.mapId === mapId));
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
  return tags.filter((tag) => {
    const key = tagIdentity(tag);
    if (!key || key === "raw" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// FC 与 No Major Skips 可按挑战补标；DTS 只能来自记录本身。
function publicTagsForChallenge(name: string) {
  const tags: string[] = [];
  if (isExplicitFcChallenge(name)) tags.push("FC");
  if (/No\s+Major\s+Skips?/i.test(name)) tags.push("No Major Skips");
  return tags;
}

/*
 * 投影结果按目录对象缓存：目录一换（fetchCatalog 或后台命令后的重新拉取）
 * 整批作废；overlay 每次刷新都是新对象，挂 WeakMap 上自然失效。
 */
type Bucket = {
  actual?: Submission[];
  maximal?: Submission[];
  hidden?: Submission[];
  byChallenge: Map<number, Submission[]>;
};
const newBucket = (): Bucket => ({ byChallenge: new Map() });
let cachedSource: unknown = null;
let publicBucket = newBucket();
let overlayBuckets = new WeakMap<RecordOverlay, Bucket>();

function bucket(overlay?: RecordOverlay): Bucket {
  const source = catalog.value;
  if (source !== cachedSource) {
    cachedSource = source;
    publicBucket = newBucket();
    overlayBuckets = new WeakMap();
  }
  if (!overlay) return publicBucket;
  const existing = overlayBuckets.get(overlay);
  if (existing) return existing;
  const fresh = newBucket();
  overlayBuckets.set(overlay, fresh);
  return fresh;
}

/** 分组键用不可见分隔符，避免编号里出现的字符把键切错。 */
const SEPARATOR = String.fromCharCode(0);
const groupKey = (a: number, b: number) => `${a}${SEPARATOR}${b}`;

/**
 * overlay 里能参与投影的记录。提案记录的 challengeId 还是空的（它要新建的挑战
 * 尚未存在），在 DAG 上挂不到任何节点，只能等后台把挑战建起来。
 */
function linkedOverlayRecords(overlay?: RecordOverlay) {
  return (overlay?.records ?? [])
    .filter((record): record is AdminRecord & { challengeId: number } => record.challengeId !== null);
}

/** 目录里的已通过记录（挡掉隐藏标记），叠上 overlay 里已通过的那些。 */
function actualSubmissions(overlay?: RecordOverlay): Submission[] {
  const store = bucket(overlay);
  if (store.actual) return store.actual;
  const overlayIds = new Set(overlay?.records.map((record) => record.id) ?? []);
  const fromCatalog = catalog.value.submissions
    .filter((record) => !overlayIds.has(record.id) && record.status !== "hidden" && !hasHiddenTag(record.tags))
    .map((record) => ({ ...record, tags: uniquePublicTags(record.tags || []) }));
  const fromOverlay: Submission[] = linkedOverlayRecords(overlay)
    .filter((record) => record.status === "accepted" && !hasHiddenTag(record.reviewTags))
    .map((record) => ({
      id: record.id, challengeId: record.challengeId, playerId: record.playerId, achievedAt: record.achievedAt, verified: record.verified,
      videoUrl: record.videoUrl, rawVideoUrl: record.rawVideoUrl,
      tags: uniquePublicTags((record.reviewTags || []).filter((tag) => tag.kind === "badge" || tag.kind === "note").map((tag) => tag.text)),
      verifierNote: record.verifierNote, note: record.playerNote, reviewer: record.reviewer,
      reviewedAt: record.reviewedAt, status: "accepted" as const,
      recommends: record.recommends, opinionTier: record.opinionTier, duration: record.duration,
    }));
  store.actual = [...fromCatalog, ...fromOverlay];
  return store.actual;
}

/** 同玩家同挑战取最近达成记录；未知日期排后，ID 保证稳定，标签不跨记录拼接。 */
function uniqueAchievements(records: Submission[]) {
  const result = new Map<string, Submission>();
  const sorted = [...records].sort((a, b) =>
    (b.achievedAt || "").localeCompare(a.achievedAt || "")
    || (b.reviewedAt || "").localeCompare(a.reviewedAt || "")
    || a.id - b.id);
  for (const record of sorted) {
    const key = groupKey(record.playerId, record.challengeId);
    if (!result.has(key)) result.set(key, record);
  }
  return [...result.values()];
}

/** 同图同人只留 DAG 上的极大元：被更高节点覆盖的记录不重复计入。 */
function maximalSubmissions(overlay?: RecordOverlay) {
  const store = bucket(overlay);
  if (store.maximal) return store.maximal;
  const sourceChallenges = projectedChallenges();
  const challengeById = new Map(sourceChallenges.map((item) => [item.id, item]));
  const groups = new Map<string, Submission[]>();
  const passthrough: Submission[] = [];
  for (const record of actualSubmissions(overlay)) {
    const mapId = challengeById.get(record.challengeId)?.mapId;
    if (!mapId) { passthrough.push(record); continue; }
    const key = groupKey(mapId, record.playerId);
    const existing = groups.get(key);
    if (existing) existing.push(record); else groups.set(key, [record]);
  }
  const edgeCache = new Map<number, ChallengeRelation[]>();
  const result = [...passthrough];
  for (const [key, records] of groups) {
    const mapId = Number(key.split(SEPARATOR, 1)[0]);
    const edges = edgeCache.get(mapId) || relationsForMap(mapId, sourceChallenges);
    edgeCache.set(mapId, edges);
    result.push(...records.filter((record) => !records.some((other) =>
      other.id !== record.id
      && relationExists(record.challengeId, other.challengeId, edges)
      && !preservesClearRecord(challengeById.get(record.challengeId)!, challengeById.get(other.challengeId)!))));
  }
  store.maximal = result;
  return result;
}

export function playerSubmissions(playerId: number, overlay?: RecordOverlay) {
  return uniqueAchievements(maximalSubmissions(overlay).filter((record) => record.playerId === playerId));
}

/**
 * 被挡下的记录：目录里带 Hidden 的、overlay 里状态为隐藏的，以及同一玩家
 * 在 DAG 更高节点已有记录、因而被覆盖的前置记录。最后一类会随着后继记录
 * 下线自动恢复显示。
 */
function hiddenSubmissions(overlay?: RecordOverlay): Submission[] {
  const store = bucket(overlay);
  if (store.hidden) return store.hidden;
  const overlayIds = new Set(overlay?.records.map((record) => record.id) ?? []);
  const fromCatalog = catalog.value.submissions
    .filter((record) => !overlayIds.has(record.id) && (record.status === "hidden" || hasHiddenTag(record.tags)))
    .map((record) => ({ ...record, status: "hidden" as const, tags: Array.from(new Set([...(record.tags || []), "Hidden"])) }));
  const fromOverlay = linkedOverlayRecords(overlay)
    .filter((record) => record.status === "hidden" || hasHiddenTag(record.reviewTags))
    .map<Submission>((record) => ({
      id: record.id, challengeId: record.challengeId, playerId: record.playerId, achievedAt: record.achievedAt, verified: record.verified,
      videoUrl: record.videoUrl, rawVideoUrl: record.rawVideoUrl, note: record.playerNote,
      verifierNote: record.verifierNote, reviewer: record.reviewer, reviewedAt: record.reviewedAt,
      status: "hidden", recommends: record.recommends, opinionTier: record.opinionTier, duration: record.duration,
      tags: uniquePublicTags([...(record.reviewTags || []).filter((tag) => tag.kind === "badge" || tag.kind === "note").map((tag) => tag.text), "Hidden"]),
    }));
  const maximalIds = new Set(maximalSubmissions(overlay).map((record) => groupKey(record.playerId, record.challengeId)));
  const superseded = uniqueAchievements(actualSubmissions(overlay))
    .filter((record) => !maximalIds.has(groupKey(record.playerId, record.challengeId)))
    .map((record) => ({ ...record, status: "hidden" as const, tags: Array.from(new Set([...(record.tags || []), "Hidden"])) }));
  store.hidden = Array.from(new Map([...fromCatalog, ...fromOverlay, ...superseded].map((record) => [record.id, record])).values());
  return store.hidden;
}

export function hiddenPlayerSubmissions(playerId: number, overlay?: RecordOverlay) {
  return hiddenSubmissions(overlay).filter((record) => record.playerId === playerId);
}

export function hiddenSubmissionsForChallenge(challengeId: number, overlay?: RecordOverlay) {
  const sourceChallenges = projectedChallenges();
  const target = sourceChallenges.find((item) => item.id === challengeId);
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
  const target = sourceChallenges.find((item) => item.id === challengeId);
  if (!target) {
    const direct = maximalSubmissions(overlay).filter((record) => record.challengeId === challengeId);
    store.byChallenge.set(challengeId, direct);
    return direct;
  }
  const edges = relationsForMap(target.mapId, sourceChallenges);
  const eligible = new Set([challengeId, ...descendantsOf(challengeId, edges)]);
  const result = maximalSubmissions(overlay).filter((record) => eligible.has(record.challengeId)).map((record) => {
    const inherited = record.challengeId !== challengeId;
    const source = sourceChallenges.find((item) => item.id === record.challengeId);
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
  const directPlayers = new Set(result.filter((record) => !record.inheritedFromChallengeId).map((record) => record.playerId));
  const visible = result.filter((record) => !record.inheritedFromChallengeId || !directPlayers.has(record.playerId));
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
  const multiChallenge = catalog.value.multiMapChallenges.find((item) => item.id === challengeId);
  const campaigns = projectedCampaigns();
  const campaign = multiChallenge
    ? campaigns.find((item) => item.id === multiChallenge.campaignId)
    : map?.campaignId ? campaigns.find((item) => item.id === map.campaignId) : undefined;
  return {
    challenge, map, multiChallenge, campaign,
    label: [map?.name || campaign?.name, challenge?.name || multiChallenge?.name].filter(Boolean).join(" · ") || String(challengeId),
  };
}
