import { siteStatsQuery, type SiteStats } from "./site-stats-query";
import { imageUrl } from "../assets/service";
import { playerBilibiliUids } from "../../../../shared/src/bilibili-uid";
/** 目录与提交记录的读路径。库是唯一权威，本文件是全站唯一的读入口。 */
import { and, asc, countDistinct, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, campaign, challenge, challengeRelation, map, player, submission, submissionTag, suggestion, suggestionResponse } from "../../db/schema/index";
import { suggestionDueAt } from "../../../../shared/src/suggestions";
import type { Campaign, Challenge, MapItem, MultiMapChallenge, Player, Submission, Suggestion, SuggestionResponse } from "../../../../shared/src/types";

/* ---------- 行 → 类型映射（DB 蛇形列 → 应用 camelCase 类型） ---------- */

function toCampaign(row: typeof campaign.$inferSelect, stats?: { mapCount: number; clearCount: number }): Campaign {
  return {
    id: row.id, notice: row.notice ?? undefined, name: row.name, cnName: row.cnName ?? undefined, shortName: row.shortName,
    author: row.author, url: row.url, blurb: row.blurb,
    goldenedCount: stats?.clearCount ?? 0, mapCount: stats?.mapCount ?? 0,
    banner: imageUrl(row.banner) ?? undefined, bannerSource: row.bannerSource ?? undefined,
    gameBananaUrl: row.gameBananaUrl ?? undefined, searchAliases: row.searchAliases ?? undefined,
  };
}

function toMapItem(row: typeof map.$inferSelect): MapItem {
  return {
    id: row.id, campaignId: row.campaignId, name: row.name, cnName: row.cnName ?? undefined,
    author: row.author, url: row.url, primaryTier: (row.primaryTier ?? "t7") as MapItem["primaryTier"],
    histStars: row.histStars, histSubTier: row.histSubTier as MapItem["histSubTier"],
    recommendationPercent: row.recommendationPercent, rating: row.rating,
    description: row.description, banner: imageUrl(row.banner) ?? undefined, bannerSource: row.bannerSource ?? undefined,
    notice: row.notice ?? undefined, searchAliases: row.searchAliases ?? undefined,
  };
}

type ChallengeSelect = typeof challenge.$inferSelect;
type SubmissionSelect = {
  id: number; challengeId: number; playerId: number; status: string;
  achievedAt: string | null; videoUrl: string; rawVideoUrl: string | null;
  playerNote: string | null; verifierNote: string | null; reviewedAt: string | Date | null;
  duration: string | null; opinionTier: string | null; recommends: boolean | null;
  tags: string[]; reviewer: string | null;
};

function toChallenge(row: ChallengeSelect, clearCount: number): Challenge {
  return {
    id: row.id, mapId: row.mapId!, name: row.name,
    type: (row.type ?? "Other") as Challenge["type"], tier: (row.tierCode ?? null) as Challenge["tier"],
    clearCount, description: row.description, notice: row.notice ?? undefined,
  };
}

function toMultiMapChallenge(row: ChallengeSelect, clearCount: number): MultiMapChallenge {
  return {
    id: row.id, campaignId: row.campaignId!, name: row.name,
    type: (row.type ?? undefined) as MultiMapChallenge["type"],
    tier: (row.tierCode ?? "undetermined") as MultiMapChallenge["tier"],
    clearCount, description: row.description || undefined, notice: row.notice ?? undefined,
  };
}

function toPlayer(row: typeof player.$inferSelect): Player {
  return {
    id: row.id, name: row.name, bio: row.bio ?? undefined,
    bilibiliUids: playerBilibiliUids(row),
    bilibiliUid: row.bilibiliUid ?? undefined, bilibiliUrl: row.bilibiliUrl ?? undefined,
    aliases: row.aliases ?? undefined, status: (row.status ?? "unasked") as Player["status"],
  };
}

function tagIdentity(tag: string) {
  return /^(?:FC|月莓|moon)$/i.test(tag.trim()) ? "fc" : tag.trim().toLocaleLowerCase();
}

function uniquePublicTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const text = tag.trim();
    if (!text || text.toUpperCase() === "RAW") return false;
    const key = tagIdentity(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toSubmission(row: SubmissionSelect): Submission {
  return {
    id: row.id, challengeId: row.challengeId, playerId: row.playerId,
    achievedAt: row.achievedAt ? String(row.achievedAt).slice(0, 10) : "",
    videoUrl: row.videoUrl, rawVideoUrl: row.rawVideoUrl ?? undefined,
    tags: row.tags.length ? row.tags : undefined,
    note: row.playerNote ?? undefined, verifierNote: row.verifierNote ?? undefined,
    reviewer: row.reviewer ?? undefined,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : undefined,
    duration: row.duration ?? undefined,
    status: (row.status ?? "pending") as Submission["status"],
    opinionTier: (row.opinionTier ?? undefined) as Submission["opinionTier"], recommends: row.recommends ?? undefined,
  };
}

/** 玩家回收只改档案，记录原状态保持，恢复时自然恢复公开投影。 */
const visibleSubmissionPlayer = sql`exists (select 1 from player where player.id = ${submission.playerId} and player.deleted_at is null)`;

/* ---------- 统计 ---------- */

/** 一批挑战的 clear_count。drizzle 原生聚合，不进视图裸 SQL（数组参数序列化会踩坑）。 */
async function clearCounts(ids: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (!ids.length) return result;
  const rows = await db
    .select({ challengeId: submission.challengeId, n: countDistinct(submission.playerId) })
    .from(submission)
    .where(and(inArray(submission.challengeId, ids), eq(submission.status, "accepted"), isNull(submission.deletedAt), visibleSubmissionPlayer))
    .groupBy(submission.challengeId);
  for (const row of rows) if (row.challengeId) result.set(row.challengeId, row.n);
  return result;
}

/* ---------- 实体查询 ---------- */

export async function getCampaign(id: number) {
  const rows = await db.select().from(campaign).where(and(eq(campaign.id, id), isNull(campaign.deletedAt))).limit(1);
  if (!rows[0]) return undefined;
  const statsRows = await db
    .select({ mapCount: sql<number>`count(distinct ${map.id})`, clearCount: sql<number>`count(distinct (${submission.challengeId}, ${submission.playerId})) filter (where ${submission.id} is not null)` })
    .from(campaign)
    .leftJoin(map, and(eq(map.campaignId, campaign.id), isNull(map.deletedAt)))
    .leftJoin(challenge, and(eq(challenge.mapId, map.id), eq(challenge.scope, "map"), isNull(challenge.deletedAt)))
    .leftJoin(submission, and(eq(submission.challengeId, challenge.id), eq(submission.status, "accepted"), isNull(submission.deletedAt), visibleSubmissionPlayer))
    .where(eq(campaign.id, id))
    .groupBy(campaign.id);
  const stat = statsRows[0] ?? { mapCount: 0, clearCount: 0 };
  return toCampaign(rows[0], { mapCount: Number(stat.mapCount), clearCount: Number(stat.clearCount) });
}

export async function listCampaigns(options: { includeStandalone?: boolean; skipStats?: boolean } = {}) {
  const where = options.includeStandalone
    ? isNull(campaign.deletedAt)
    : and(eq(campaign.isStandalone, false), isNull(campaign.deletedAt));
  const rows = await db.select().from(campaign).where(where).orderBy(asc(campaign.sortOrder), asc(campaign.id));
  if (options.skipStats) return rows.map(row => toCampaign(row));
  // 包统计：地图数与通过记录数一次聚合出来
  const statsRows = await db
    .select({ campaignId: campaign.id, mapCount: sql<number>`count(distinct ${map.id})`, clearCount: sql<number>`count(distinct (${submission.challengeId}, ${submission.playerId})) filter (where ${submission.id} is not null)` })
    .from(campaign)
    .leftJoin(map, and(eq(map.campaignId, campaign.id), isNull(map.deletedAt)))
    .leftJoin(challenge, and(eq(challenge.mapId, map.id), eq(challenge.scope, "map"), isNull(challenge.deletedAt)))
    .leftJoin(submission, and(eq(submission.challengeId, challenge.id), eq(submission.status, "accepted"), isNull(submission.deletedAt), visibleSubmissionPlayer))
    .groupBy(campaign.id);
  const byId = new Map(statsRows.map((r) => [r.campaignId, { mapCount: Number(r.mapCount), clearCount: Number(r.clearCount) }]));
  return rows.map((row) => toCampaign(row, byId.get(row.id)));
}

export async function getMap(id: number) {
  const rows = await db.select().from(map).where(and(eq(map.id, id), isNull(map.deletedAt))).limit(1);
  return rows[0] ? toMapItem(rows[0]) : undefined;
}

export async function listAllMaps() {
  const rows = await db.select().from(map)
    .where(isNull(map.deletedAt))
    .orderBy(asc(map.sortOrder), asc(map.id));
  return rows.map(toMapItem);
}

export async function listAllChallenges(options: { skipStats?: boolean } = {}) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.scope, "map"), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  const counts = options.skipStats ? new Map<number, number>() : await clearCounts(rows.map((r) => r.id));
  return rows.map((row) => toChallenge(row, counts.get(row.id) ?? 0));
}

export async function listMultiMapChallenges(options: { skipStats?: boolean } = {}) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.scope, "campaign"), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  const counts = options.skipStats ? new Map<number, number>() : await clearCounts(rows.map((r) => r.id));
  return rows.map((row) => toMultiMapChallenge(row, counts.get(row.id) ?? 0));
}

export async function getCampaignMaps(campaignId: number) {
  const rows = await db.select().from(map)
    .where(and(eq(map.campaignId, campaignId), isNull(map.deletedAt)))
    .orderBy(asc(map.sortOrder), asc(map.id));
  return rows.map(toMapItem);
}

export async function getMapChallenges(mapId: number) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.scope, "map"), eq(challenge.mapId, mapId), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  const counts = await clearCounts(rows.map((r) => r.id));
  return rows.map((row) => toChallenge(row, counts.get(row.id) ?? 0));
}

export async function getCampaignMultiMapChallenges(campaignId: number) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.scope, "campaign"), eq(challenge.campaignId, campaignId), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  const counts = await clearCounts(rows.map((r) => r.id));
  return rows.map((row) => toMultiMapChallenge(row, counts.get(row.id) ?? 0));
}

export async function getChallenge(id: number) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.id, id), eq(challenge.scope, "map"), isNull(challenge.deletedAt))).limit(1);
  if (!rows[0]) return undefined;
  return toChallenge(rows[0], (await clearCounts([id])).get(id) ?? 0);
}

export async function getMultiMapChallenge(id: number) {
  const rows = await db.select().from(challenge)
    .where(and(eq(challenge.id, id), eq(challenge.scope, "campaign"), isNull(challenge.deletedAt))).limit(1);
  if (!rows[0]) return undefined;
  return toMultiMapChallenge(rows[0], (await clearCounts([id])).get(id) ?? 0);
}

export async function getPlayer(id: number) {
  const rows = await db.select().from(player).where(and(eq(player.id, id), isNull(player.deletedAt))).limit(1);
  return rows[0] ? toPlayer(rows[0]) : undefined;
}

export async function listPlayers() {
  const rows = await db.select().from(player).where(isNull(player.deletedAt)).orderBy(asc(player.name), asc(player.id));
  return rows.map(toPlayer);
}

/* ---------- 提交记录 ---------- */

/** 查询记录并带上公开标签（导入 tag 与审核 badge）和审核备注。 */
async function selectSubmissions(where: ReturnType<typeof and> | ReturnType<typeof eq> | undefined) {
  const rows = await db
    .select({
      id: submission.id, challengeId: submission.challengeId, playerId: submission.playerId,
      status: submission.status, achievedAt: submission.achievedAt, videoUrl: submission.videoUrl,
      rawVideoUrl: submission.rawVideoUrl, playerNote: submission.playerNote, verifierNote: submission.verifierNote,
      reviewedBy: submission.reviewedBy, reviewedAt: submission.reviewedAt, duration: submission.duration,
      opinionTier: submission.opinionTier, recommends: submission.recommends,
    })
    .from(submission)
    .leftJoin(account, eq(account.id, submission.reviewedBy))
    .where(and(where, isNull(submission.deletedAt), visibleSubmissionPlayer))
    .orderBy(desc(submission.achievedAt), asc(submission.id));
  if (!rows.length) return [] as Submission[];

  const ids = rows.map((r) => r.id);
  const tagRows = await db.select().from(submissionTag)
    .where(and(inArray(submissionTag.submissionId, ids), inArray(submissionTag.kind, ["badge", "note"])));
  const tagsBySubmission = new Map<number, string[]>();
  for (const tag of tagRows) {
    const list = tagsBySubmission.get(tag.submissionId) ?? [];
    list.push(tag.text);
    tagsBySubmission.set(tag.submissionId, list);
  }
  const reviewerIds = [...new Set(rows.map((row) => row.reviewedBy).filter((id): id is number => Boolean(id)))];
  const reviewerRows = reviewerIds.length
    ? await db.select({ id: account.id, displayName: account.displayName }).from(account).where(inArray(account.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewerRows.map((row) => [row.id, row.displayName]));
  return rows.map((row) => toSubmission({
    ...row, challengeId: row.challengeId!,
    tags: uniquePublicTags(tagsBySubmission.get(row.id) ?? []),
    reviewer: row.reviewedBy ? reviewerNames.get(row.reviewedBy) ?? null : null,
  }));
}

export async function getChallengeSubmissions(challengeId: number) {
  return selectSubmissions(and(eq(submission.challengeId, challengeId), eq(submission.status, "accepted")));
}

export async function getMultiMapChallengeSubmissions(challengeId: number) {
  return selectSubmissions(and(eq(submission.challengeId, challengeId), eq(submission.status, "accepted")));
}

export async function getMapSubmissions(mapId: number) {
  const challengeRows = await db.select({ id: challenge.id }).from(challenge)
    .where(and(eq(challenge.scope, "map"), eq(challenge.mapId, mapId), isNull(challenge.deletedAt)));
  if (!challengeRows.length) return [] as Submission[];
  return selectSubmissions(and(inArray(submission.challengeId, challengeRows.map((r) => r.id)), eq(submission.status, "accepted")));
}

export async function getPlayerSubmissions(playerId: number) {
  return selectSubmissions(and(eq(submission.playerId, playerId), eq(submission.status, "accepted")));
}

export async function listAllSubmissions() {
  return selectSubmissions(and(eq(submission.status, "accepted"), sql`${submission.challengeId} IS NOT NULL`));
}

/* ---------- 意见箱 ---------- */

/** 投票是否还开着由 due_at 说了算，不再只是一行倒计时文字。 */
function effectiveSuggestionState(row: { kind: string; state: string; createdAt: string | null; dueAt: Date | null }): Suggestion["state"] {
  if (row.kind === "GENERAL") return row.state === "DECIDED" ? "DECIDED" : "ONGOING";
  if (row.state === "DECIDED" || !row.dueAt) return row.state as Suggestion["state"];
  const due = suggestionDueAt(row.createdAt, row.dueAt);
  return due && due.getTime() > Date.now() ? "ONGOING" : "UNDECIDED";
}

export async function listSuggestions() {
  const rows = await db.select().from(suggestion).orderBy(asc(suggestion.id));
  const responses = await db.select().from(suggestionResponse)
    .where(inArray(suggestionResponse.suggestionId, rows.map((r) => r.id)))
    .orderBy(asc(suggestionResponse.createdAt), asc(suggestionResponse.id));
  const byId = new Map<number, SuggestionResponse[]>();
  for (const r of responses) {
    const list = byId.get(r.suggestionId) ?? [];
    list.push({
      player: r.player, progress: r.progress, opinion: r.opinion,
      vote: (r.vote ?? undefined) as SuggestionResponse["vote"],
      opinionTier: (r.opinionTier ?? undefined) as SuggestionResponse["opinionTier"],
      comment: r.comment ?? undefined,
    });
    byId.set(r.suggestionId, list);
  }
  return rows.map((row): Suggestion => {
    const list = byId.get(row.id) ?? [];
    return {
      id: row.id, title: row.title, kind: row.kind as Suggestion["kind"],
      state: effectiveSuggestionState(row), source: row.source,
      challengeId: row.challengeId ?? undefined, mapId: row.mapId ?? undefined, campaignId: row.campaignId ?? undefined,
      createdAt: row.createdAt ?? undefined, currentTier: (row.currentTier ?? undefined) as Suggestion["currentTier"],
      suggestedTier: (row.suggestedTier ?? undefined) as Suggestion["suggestedTier"],
      resultTier: (row.resultTier ?? undefined) as Suggestion["resultTier"],
      decision: (row.decision ?? undefined) as Suggestion["decision"],
      decisionNote: row.decisionNote ?? undefined, archiveVoteScope: row.archiveVoteScope ?? undefined,
      archiveVotes: (row.archiveVotes ?? undefined) as Suggestion["archiveVotes"],
      dueAt: row.kind !== "GENERAL" && row.dueAt ? row.dueAt.toISOString() : undefined,
      body: row.body,
      // 展示字段：票数由 responses 现算，其余留空让 UI 按 createdAt 兜底
      author: row.author, postedAgo: "", timeLeft: "",
      votesFor: list.filter((r) => r.vote === "FOR").length,
      votesAgainst: list.filter((r) => r.vote === "AGAINST").length,
      responses: list,
    };
  });
}

/* ---------- 关系图 ---------- */

export async function getChallengeRelations() {
  const rows = await db.select().from(challengeRelation);
  return rows.map((r) => ({ from: r.fromId, to: r.toId }));
}

/* ---------- 站点统计（首页用） ---------- */

/** 首页计数不需要目录或 DAG 投影；同一条 SQL 使用同一数据库快照。 */
export async function getSiteStats(): Promise<SiteStats> {
  const result = await db.execute<SiteStats>(siteStatsQuery);
  return result.rows[0];
}
