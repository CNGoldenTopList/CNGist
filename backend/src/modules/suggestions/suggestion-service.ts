import { entityId } from "../../../../shared/src/entity-id";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, campaign, challenge, map, player, suggestion, suggestionResponse, submission, submissionTag, challengeRelation, challengeRelationOverride } from "../../db/schema/index";
import { fail, type ApiErrorCode } from "../../../../shared/src/api-errors";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import { suggestionVotingOpen } from "../../../../shared/src/suggestions";
import { buildDefaultChallengeRelations, descendantsOf } from "../../../../shared/src/challenge-graph";
import type { Challenge } from "../../../../shared/src/types";
import { writeAudit, type Tx } from "../admin/audit";

/** Existential DAG projection; a player with multiple eligible clears still counts once. */
async function hasCompleted(tx: Tx, playerId: number, challengeId: number) {
  if (!challengeId) return fail("challengeMissing");
          const [target] = await tx.select().from(challenge).where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt)));
  if (!target) return false;
  let packId = target.campaignId;
  let eligible = [challengeId];
  if (target.mapId) {
    const [targetMap] = await tx.select().from(map).where(and(eq(map.id, target.mapId), isNull(map.deletedAt)));
    if (!targetMap) return false;
    packId = targetMap.campaignId;
    const nodes = await tx.select().from(challenge).where(and(eq(challenge.mapId, target.mapId), isNull(challenge.deletedAt)));
    const [override] = await tx.select().from(challengeRelationOverride).where(eq(challengeRelationOverride.mapId, target.mapId));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = override ? (await tx.select().from(challengeRelation).where(inArray(challengeRelation.fromId, [...ids])))
      .filter((e) => ids.has(e.toId)).map((e) => ({ from: e.fromId, to: e.toId }))
      : buildDefaultChallengeRelations(nodes.map((n) => ({ id: n.id, name: n.name, mapId: n.mapId! } as Challenge)));
    eligible = [challengeId, ...descendantsOf(challengeId, edges)];
  }
  if (!packId) return false;
  const [pack] = await tx.select().from(campaign).where(and(eq(campaign.id, packId), isNull(campaign.deletedAt)));
  if (!pack) return false;
  const rows = await tx.select({ id: submission.id }).from(submission).where(and(
    eq(submission.playerId, playerId), inArray(submission.challengeId, eligible), eq(submission.status, "accepted"), isNull(submission.deletedAt),
    sql`not exists (select 1 from ${submissionTag} where ${submissionTag.submissionId} = ${submission.id} and ${submissionTag.kind} = 'badge' and lower(trim(${submissionTag.text})) = 'hidden')`,
  )).limit(1);
  return rows.length > 0;
}

class SuggestionError extends Error {
  constructor(public code: ApiErrorCode, public status = 400) { super(code); }
}
const reject = (code: ApiErrorCode, status = 400): never => { throw new SuggestionError(code, status); };
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) return reject("requestMalformed");
  return value.trim();
}

/** Identity and voting window are checked inside the same transaction as the write. */
export async function suggestionCommand(accountId: number, input: Record<string, unknown>, id?: number, database = db) {
  try {
    const data = await database.transaction(async (tx) => {
      const [owner] = await tx.select().from(account).where(eq(account.id, accountId)).for("share");
      if (!owner || owner.status !== "active") return reject("signInActive", 401);
      const [claimed] = owner.claimedPlayerId ? await tx.select().from(player).where(and(eq(player.id, owner.claimedPlayerId), isNull(player.deletedAt))) : [];
      const name = claimed?.name || owner.displayName;
      if (id) {
        const [topic] = await tx.select().from(suggestion).where(eq(suggestion.id, id)).for("update");
        if (!topic) return reject("suggestionMissing", 404);
        if (!suggestionVotingOpen(topic)) return reject("suggestionClosed", 409);
        const [previous] = await tx.select().from(suggestionResponse).where(and(eq(suggestionResponse.suggestionId, id), eq(suggestionResponse.accountId, owner.id)));
        if (input.vote === undefined && input.comment === undefined) return reject("requestIncomplete");
        if (input.vote !== undefined && (typeof input.vote !== "string" || !["NONE", "FOR", "AGAINST", "INDIFFERENT"].includes(input.vote))) return reject("requestMalformed");
        const comment = input.comment === undefined ? previous?.comment ?? null : text(input.comment, 10000);
        const vote = input.vote === undefined ? previous?.vote ?? null : input.vote === "NONE" ? null : String(input.vote);
        const completed = Boolean(claimed && topic.challengeId && await hasCompleted(tx, claimed.id, topic.challengeId));
        const values = { player: name, progress: completed ? "已完成" : "未完成", vote, comment };
        await tx.insert(suggestionResponse).values({ suggestionId: id, accountId: owner.id, ...values })
          .onConflictDoUpdate({ target: [suggestionResponse.suggestionId, suggestionResponse.accountId], set: values });
        return { id, vote: vote ?? "NONE", comment: comment ?? "" };
      }
      const kind = input.kind;
      if (typeof kind !== "string" || !["general", "placement", "split"].includes(kind)) return reject("requestMalformed");
      const body = text(input.body, 10000);
      if (!body) return reject("reportDetailRequired");
      let title = "", campaignId: number | null = null, mapId: number | null = null, challengeId: number | null = null, currentTier: string | null = null;
      let suggestedTier: string | null = null;
      if (kind === "general") {
        title = text(input.title, 200);
        if (!title) return reject("reportTitleRequired");
      } else {
        if (kind === "placement") {
          challengeId = entityId(input.challengeId);
          if (!challengeId) return fail("challengeMissing");
          const [target] = await tx.select().from(challenge).where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt))).for("share");
          if (!target) return reject("challengeMissing", 404);
          mapId = target.mapId;
          campaignId = target.campaignId;
          currentTier = target.tierCode ?? "undetermined";
          suggestedTier = text(input.suggestedTier, 30);
          if (!isDifficultyCode(suggestedTier)) return reject("suggestedTierInvalid");
          title = target.name;
        } else {
          mapId = entityId(input.mapId);
        }
        if (mapId) {
          const [targetMap] = await tx.select().from(map).where(and(eq(map.id, mapId), isNull(map.deletedAt))).for("share");
          if (!targetMap) return reject("mapMissing", 404);
          campaignId = targetMap.campaignId;
          title = `${targetMap.name}${title ? ` · ${title}` : ""}`;
        }
        if (!campaignId) return reject("requestIncomplete");
        const [pack] = await tx.select().from(campaign).where(and(eq(campaign.id, campaignId), isNull(campaign.deletedAt))).for("share");
        if (!pack) return reject("mapMissing", 404);
        if (!mapId) title = `${pack.name} · ${title}`;
      }
      const [created] = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('suggestion', 'id'))::integer as id`).then(r => r.rows);
      const newId = created.id;
      await tx.insert(suggestion).values({ id: newId, title, kind: kind === "general" ? "GENERAL" : "CHALLENGE", state: "ONGOING", source: String(kind), author: name, body,
        campaignId, mapId, challengeId, currentTier, suggestedTier, createdAt: new Date().toISOString(), dueAt: kind === "general" ? null : new Date(Date.now() + 7 * 86400000) });
      await writeAudit(tx, owner, "创建意见", `${title}\n${body}`);
      return { id: newId };
    });
    return { ok: true as const, data };
  } catch (error) {
    if (error instanceof SuggestionError) return { ...fail(error.code), status: error.status };
    throw error;
  }
}
