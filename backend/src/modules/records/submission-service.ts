import { nextEntityId } from "../../db/ids";
import { entityId } from "../../../../shared/src/entity-id";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, challenge, player, submission, submissionTag, trashItem } from "../../db/schema/index";
import { isRatedTier, isStandardTier, isTierCode } from "../../../../shared/src/tiers";
import { FC_TAG_COLOR, fixedTagColor, normalizeTagColor } from "../../../../shared/src/review-tags";
import type { AdminRecord, AdminReviewState, OwnSubmission, ProposedChallengeTarget, ReviewTag } from "../../../../shared/src/admin";
import { challengeLabel, diffLines, reviewAuditType, submissionLabel, writeAudit, type Actor } from "../admin/audit";
import { fail, type ApiErrorCode, type ApiFailure } from "../../../../shared/src/api-errors";
import { expandBilibiliVideoRef } from "../../integrations/bilibili";

type Result<T> = { ok: true; data: T } | (ApiFailure & { status: number }) | { ok: false; error: string; code?: undefined; status: number };
/** 审计里的状态与推荐用中文展示，别把英文枚举写进给人看的日志。 */
function statusLabel(value: unknown) {
  const map: Record<string, string> = { pending: "待审核", accepted: "已通过", rejected: "已拒绝", hidden: "隐藏" };
  return typeof value === "string" ? map[value] ?? value : value;
}
function recommendLabel(value: unknown) {
  return value === true ? "推荐" : value === false ? "不推荐" : value;
}

const ACTIVE_STATUSES = new Set<AdminReviewState>(["pending", "accepted", "rejected", "hidden"]);
const UNIQUE_VIOLATION = "23505";

function failure(error: string, status = 400): Result<never> { return { ok: false, error, status }; }
/** 带错误码的失败：界面会按当前语言翻译。 */
function failCode(code: ApiErrorCode, status = 400): Result<never> { return { ...fail(code), status }; }
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function optional(value: unknown, max: number) { const result = clean(value, max); return result || null; }
function validUrl(value: string) { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function dateOnly(value: unknown) {
  const result = clean(value, 32).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && !Number.isNaN(Date.parse(`${result}T00:00:00Z`)) ? result : null;
}
function isUniqueViolation(error: unknown) {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) if ((current as { code?: string }).code === UNIQUE_VIOLATION) return true;
  return false;
}
function isExplicitFcName(name: string) {
  return !/(?:^|[^a-z])C\s*\/\s*FC(?:[^a-z]|$)|(?:^|[^a-z])FC\s*\/\s*C(?:[^a-z]|$)/i.test(name)
    && /(?:^|[^a-z])FC(?:[^a-z]|$)/i.test(name);
}

type PlayerSubmissionInput = {
  kind?: "run" | "challenge"; challengeId?: number; achievedAt?: string; videoUrl?: string; rawVideoUrl?: string;
  playerNote?: string; duration?: string; opinionTier?: string; recommends?: boolean | null;
  proposedTarget?: Partial<ProposedChallengeTarget>;
  addFc?: boolean;
};

/** 玩家提交只相信服务端会话里的 account/player，不接受客户端传来的身份字段。 */
export async function createPlayerSubmission(actor: Actor, playerId: number, input: PlayerSubmissionInput, options: { mark?: string } = {}): Promise<Result<AdminRecord>> {
  if (input.addFc !== undefined && typeof input.addFc !== "boolean") return failCode("requestMalformed");
  if (input.addFc && input.kind === "challenge") return failCode("fcRequiresCombinedChallenge");
  const videoUrl = expandBilibiliVideoRef(clean(input.videoUrl, 2_000));
  const rawVideoUrl = optional(expandBilibiliVideoRef(clean(input.rawVideoUrl, 2_000)), 2_000);
  const achievedAt = dateOnly(input.achievedAt);
  if (!videoUrl || !validUrl(videoUrl)) return failCode("videoUrlInvalid");
  if (rawVideoUrl && !validUrl(rawVideoUrl)) return failCode("rawUrlInvalid");
  if (!achievedAt) return failCode("achievedAtInvalid");

  let challengeId: number | null = null;
  let proposedTarget: ProposedChallengeTarget | null = null;
  let mark = options.mark ?? "玩家提交";
  if (input.kind === "challenge") {
    const source = input.proposedTarget ?? {};
    proposedTarget = {
      campaignName: clean(source.campaignName, 200), mapName: clean(source.mapName, 200), challengeName: clean(source.challengeName, 200),
      gameBananaUrl: optional(source.gameBananaUrl, 2_000) ?? undefined,
      suggestedTier: optional(source.suggestedTier, 32) ?? undefined,
      rules: optional(source.rules, 4_000) ?? undefined,
    };
    if (!proposedTarget.campaignName || !proposedTarget.mapName || !proposedTarget.challengeName) return failCode("proposalIncomplete");
    if (proposedTarget.gameBananaUrl && !validUrl(proposedTarget.gameBananaUrl)) return failCode("gameBananaInvalid");
    if (proposedTarget.suggestedTier && proposedTarget.suggestedTier !== "undetermined" && !isRatedTier(proposedTarget.suggestedTier)) return failCode("suggestedTierInvalid");
    mark = options.mark ?? "玩家提交新地图或挑战";
  } else {
    challengeId = entityId(input.challengeId);
    if (!challengeId) return failCode("challengeRequired");
    const rows = await db.select({ id: challenge.id, tierCode: challenge.tierCode }).from(challenge).where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt))).limit(1);
    if (!rows[0]) return failCode("challengeMissing", 404);
  }

  const opinionTier = input.opinionTier && isRatedTier(input.opinionTier) ? input.opinionTier : null;
  const id = await nextEntityId("submission");
  let status: "pending" | "accepted" = "pending";
  const reviewTags: ReviewTag[] = [];
  try {
    const inserted = await db.transaction(async (tx) => {
      if (challengeId) {
        const [targetChallenge] = await tx.select({ tierCode: challenge.tierCode, type: challenge.type }).from(challenge)
          .where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt))).for("share");
        if (!targetChallenge) return "challengeMissing";
        if (input.addFc && targetChallenge.type !== "C/FC") return "fcRequiresCombinedChallenge";
        status = isStandardTier(targetChallenge.tierCode) ? "accepted" : "pending";
      }
      const [target] = await tx.select().from(player).where(and(eq(player.id, playerId), isNull(player.deletedAt))).for("share");
      if (!target) return false;
      if (!options.mark) {
        const [owner] = await tx.select().from(account).where(eq(account.id, actor.id)).for("share");
        if (!owner || owner.status !== "active" || owner.claimedPlayerId !== playerId) return false;
      }
      await tx.insert(submission).values({
        id, challengeId, playerId, submittedBy: actor.id, status, achievedAt, videoUrl, rawVideoUrl,
        playerNote: optional(input.playerNote, 4_000), duration: optional(input.duration, 100), opinionTier,
        recommends: typeof input.recommends === "boolean" ? input.recommends : null, proposedTarget,
      });
      await tx.insert(submissionTag).values({ submissionId: id, kind: "mark", text: mark });
      if (input.addFc === true) {
        const [tag] = await tx.insert(submissionTag).values({ submissionId: id, kind: "badge", text: "FC", color: FC_TAG_COLOR }).returning();
        reviewTags.push({ id: tag.id, kind: "badge", text: "FC", color: FC_TAG_COLOR });
      }
      const label = challengeId
        ? await submissionLabel(tx, id)
        : `${proposedTarget!.campaignName} · ${proposedTarget!.mapName} · ${proposedTarget!.challengeName}`;
      await writeAudit(tx, actor, status === "accepted" ? "玩家提交 Standard 个人记录（未经核实）" : mark === "玩家提交" ? "玩家提交待审核记录" : mark, input.addFc ? `${label}\n- 玩家添加标签：FC` : label);
      return true;
    });
    if (inserted === "fcRequiresCombinedChallenge") return failCode("fcRequiresCombinedChallenge");
    if (inserted === "challengeMissing") return failCode("challengeMissing", 404);
    if (!inserted) return failCode("playerMissing", 404);
  } catch (error) {
    if (isUniqueViolation(error)) return failCode("submissionDuplicate", 409);
    throw error;
  }
  return { ok: true, data: {
    id, challengeId: challengeId ?? null, playerId, achievedAt, videoUrl, rawVideoUrl: rawVideoUrl ?? undefined,
    playerNote: optional(input.playerNote, 4_000) ?? undefined, status, verified: false, marks: [mark], reviewTags, createdAt: new Date().toISOString(),
    opinionTier: opinionTier ?? undefined, recommends: typeof input.recommends === "boolean" ? input.recommends : undefined,
    duration: optional(input.duration, 100) ?? undefined, proposedTarget: proposedTarget ?? undefined,
  } };
}

/** 行 → AdminRecord。列表与单条查询共用，两边的 reviewTags 必须是同一份形状。 */
function toAdminRecord(
  row: typeof submission.$inferSelect,
  recordTags: Array<typeof submissionTag.$inferSelect>,
  reviewerNames: Map<number, string>,
): AdminRecord {
  return {
    id: row.id, challengeId: row.challengeId ?? null, playerId: row.playerId,
    achievedAt: row.achievedAt ? String(row.achievedAt).slice(0, 10) : "", videoUrl: row.videoUrl,
    rawVideoUrl: row.rawVideoUrl ?? undefined, playerNote: row.playerNote ?? undefined, verifierNote: row.verifierNote ?? undefined,
    status: row.status as AdminReviewState, verified: row.verified,
    reviewing: row.reviewingBy && row.reviewingAt
      ? { by: reviewerNames.get(row.reviewingBy) ?? String(row.reviewingBy), note: row.reviewingNote ?? undefined, at: row.reviewingAt.toISOString() }
      : undefined,
    marks: recordTags.filter((tag) => tag.kind === "mark").map((tag) => tag.text),
    reviewTags: recordTags.filter((tag) => tag.kind === "badge" || tag.kind === "note").map((tag) => ({ id: tag.id, kind: tag.kind as ReviewTag["kind"], text: tag.text, color: tag.color ?? undefined })),
    createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString(),
    reviewer: row.reviewedBy ? reviewerNames.get(row.reviewedBy) : undefined,
    opinionTier: row.opinionTier && isRatedTier(row.opinionTier) ? row.opinionTier : undefined,
    recommends: row.recommends ?? undefined, duration: row.duration ?? undefined,
    proposedTarget: (row.proposedTarget ?? undefined) as ProposedChallengeTarget | undefined,
  };
}

/** 后台记录列表：网站产生的运行时记录，外加任何非「已通过」的历史记录。 */
export async function listRuntimeSubmissions(): Promise<AdminRecord[]> {
  const rows = await db.select().from(submission).where(and(
    or(isNotNull(submission.submittedBy), ne(submission.status, "accepted")),
    isNull(submission.deletedAt), sql`exists (select 1 from player where player.id = ${submission.playerId} and player.deleted_at is null)`,
  ));
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [tags, reviewerRows] = await Promise.all([
    db.select().from(submissionTag).where(inArray(submissionTag.submissionId, ids)),
    db.select({ id: account.id, displayName: account.displayName }).from(account),
  ]);
  const tagsById = new Map<number, typeof tags>();
  for (const tag of tags) { const list = tagsById.get(tag.submissionId) ?? []; list.push(tag); tagsById.set(tag.submissionId, list); }
  const reviewerNames = new Map(reviewerRows.map((row) => [row.id, row.displayName]));
  return rows.map((row) => toAdminRecord(row, tagsById.get(row.id) ?? [], reviewerNames))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 单条记录的后台视图。**不带** listRuntimeSubmissions 那条「站内提交或未通过」 */
export async function getRuntimeSubmission(id: number): Promise<AdminRecord | null> {
  const rows = await db.select().from(submission)
    .where(and(eq(submission.id, id), isNull(submission.deletedAt), sql`exists (select 1 from player where player.id = ${submission.playerId} and player.deleted_at is null)`)).limit(1);
  if (!rows[0]) return null;
  const [tags, reviewerRows] = await Promise.all([
    db.select().from(submissionTag).where(eq(submissionTag.submissionId, id)),
    db.select({ id: account.id, displayName: account.displayName }).from(account),
  ]);
  return toAdminRecord(rows[0], tags, new Map(reviewerRows.map((row) => [row.id, row.displayName])));
}

/* ---------- 玩家自助：看自己的审核中／已拒绝、改完重投、撤回 ---------- */

/** 本人可见的字段。审核者姓名不给，审核备注要给：那是被拒绝的原因。 */
function toOwnSubmission(row: typeof submission.$inferSelect): OwnSubmission {
  return {
    id: row.id, challengeId: row.challengeId ?? null, playerId: row.playerId, status: row.status as AdminReviewState, verified: row.verified,
    achievedAt: row.achievedAt ? String(row.achievedAt).slice(0, 10) : "", videoUrl: row.videoUrl,
    rawVideoUrl: row.rawVideoUrl ?? undefined, playerNote: row.playerNote ?? undefined,
    verifierNote: row.verifierNote ?? undefined, duration: row.duration ?? undefined,
    opinionTier: row.opinionTier && isRatedTier(row.opinionTier) ? row.opinionTier : undefined,
    recommends: row.recommends ?? undefined,
    proposedTarget: (row.proposedTarget ?? undefined) as ProposedChallengeTarget | undefined,
    createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString(),
  };
}

/** 个人页的「审核中」与「已拒绝」。已通过和隐藏的记录走公开投影，不从这里读； */
export async function listOwnOpenSubmissions(playerId: number): Promise<OwnSubmission[]> {
  const rows = await db.select().from(submission).where(and(
    eq(submission.playerId, playerId), isNull(submission.deletedAt),
    inArray(submission.status, ["pending", "rejected"]),
  )).orderBy(desc(submission.createdAt));
  return rows.map(toOwnSubmission);
}

/** 玩家改完自己的提交后重新走审核：Standard 直接 accepted，其他回到 pending，上一次的审核结论作废。 */
export async function resubmitOwnSubmission(actor: Actor, playerId: number, id: number, input: PlayerSubmissionInput): Promise<Result<OwnSubmission>> {
  const videoUrl = expandBilibiliVideoRef(clean(input.videoUrl, 2_000));
  const rawVideoUrl = optional(expandBilibiliVideoRef(clean(input.rawVideoUrl, 2_000)), 2_000);
  const achievedAt = dateOnly(input.achievedAt);
  if (!videoUrl || !validUrl(videoUrl)) return failCode("videoUrlInvalid");
  if (rawVideoUrl && !validUrl(rawVideoUrl)) return failCode("rawUrlInvalid");
  if (!achievedAt) return failCode("achievedAtInvalid");
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(submission).where(eq(submission.id, id)).for("update");
      if (!current || current.deletedAt) return failCode("recordMissing", 404);
      if (current.playerId !== playerId) return failCode("recordForbidden", 403);
      if (current.status !== "pending" && current.status !== "rejected") return failCode("recordNotEditable", 409);

      const values: Partial<typeof submission.$inferInsert> = {
        status: "pending", verified: false, reviewedBy: null, reviewedAt: null,
        verifierNote: null, reviewingBy: null, reviewingAt: null, reviewingNote: null,
        achievedAt, videoUrl, rawVideoUrl,
        playerNote: optional(input.playerNote, 4_000), duration: optional(input.duration, 100),
      };
      if (input.opinionTier !== undefined) values.opinionTier = input.opinionTier && isRatedTier(input.opinionTier) ? input.opinionTier : null;
      if (input.recommends !== undefined) values.recommends = typeof input.recommends === "boolean" ? input.recommends : null;

      let proposedTarget: ProposedChallengeTarget | null = null;
      if (current.challengeId) {
        // 选错挑战是被拒的常见原因，所以归属挑战可以改，但只能改成现存挑战。
        const challengeId = entityId(input.challengeId) || current.challengeId;
        const rows = await tx.select({ id: challenge.id, tierCode: challenge.tierCode }).from(challenge)
          .where(and(eq(challenge.id, challengeId), isNull(challenge.deletedAt))).limit(1).for("share");
        if (!rows[0]) return failCode("challengeMissing", 404);
        values.status = isStandardTier(rows[0].tierCode) ? "accepted" : "pending";
        values.challengeId = challengeId;
      } else {
        const source = input.proposedTarget ?? (current.proposedTarget ?? {}) as Partial<ProposedChallengeTarget>;
        proposedTarget = {
          campaignName: clean(source.campaignName, 200), mapName: clean(source.mapName, 200), challengeName: clean(source.challengeName, 200),
          gameBananaUrl: optional(source.gameBananaUrl, 2_000) ?? undefined,
          suggestedTier: optional(source.suggestedTier, 32) ?? undefined,
          rules: optional(source.rules, 4_000) ?? undefined,
        };
        if (!proposedTarget.campaignName || !proposedTarget.mapName || !proposedTarget.challengeName) return failCode("proposalIncomplete");
        if (proposedTarget.gameBananaUrl && !validUrl(proposedTarget.gameBananaUrl)) return failCode("gameBananaInvalid");
        if (proposedTarget.suggestedTier && proposedTarget.suggestedTier !== "undetermined" && !isRatedTier(proposedTarget.suggestedTier)) return failCode("suggestedTierInvalid");
        values.proposedTarget = proposedTarget;
      }

      await tx.update(submission).set(values).where(eq(submission.id, id));
      const before = (current.proposedTarget ?? undefined) as ProposedChallengeTarget | undefined;
      const changes = diffLines([
        ["状态", statusLabel(current.status), statusLabel(values.status)] as [string, unknown, unknown],
        ["归属挑战",
          current.challengeId ? await challengeLabel(tx, current.challengeId) : "新地图或挑战提案",
          values.challengeId ? await challengeLabel(tx, values.challengeId as number) : "新地图或挑战提案"] as [string, unknown, unknown],
        ["达成时间", current.achievedAt, values.achievedAt] as [string, unknown, unknown],
        ["挑战视频", current.videoUrl, values.videoUrl] as [string, unknown, unknown],
        ["RAW 视频", current.rawVideoUrl, values.rawVideoUrl] as [string, unknown, unknown],
        ["玩家备注", current.playerNote, values.playerNote] as [string, unknown, unknown],
        ["时长", current.duration, values.duration] as [string, unknown, unknown],
        ...("opinionTier" in values ? [["难度建议", current.opinionTier, values.opinionTier] as [string, unknown, unknown]] : []),
        ...("recommends" in values ? [["推荐", recommendLabel(current.recommends), recommendLabel(values.recommends)] as [string, unknown, unknown]] : []),
        ...(proposedTarget ? [
          ["提案地图包", before?.campaignName, proposedTarget.campaignName] as [string, unknown, unknown],
          ["提案地图", before?.mapName, proposedTarget.mapName] as [string, unknown, unknown],
          ["提案挑战", before?.challengeName, proposedTarget.challengeName] as [string, unknown, unknown],
          ["提案规则", before?.rules, proposedTarget.rules] as [string, unknown, unknown],
          ["香蕉网链接", before?.gameBananaUrl, proposedTarget.gameBananaUrl] as [string, unknown, unknown],
          ["建议难度", before?.suggestedTier, proposedTarget.suggestedTier] as [string, unknown, unknown],
        ] : []),
      ]);
      const label = await submissionLabel(tx, id);
      await writeAudit(tx, actor, "玩家修改后重新提交", [label, ...changes].join("\n"));
      const [refreshed] = await tx.select().from(submission).where(eq(submission.id, id)).limit(1);
      return { ok: true, data: toOwnSubmission(refreshed) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failCode("submissionDuplicate", 409);
    throw error;
  }
}

/** 撤回：任何状态的自有提交都能撤，撤回后进回收站（软删除 + 回收站条目）， */
export async function withdrawOwnSubmission(actor: Actor, playerId: number, id: number): Promise<Result<{ id: number }>> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(submission).where(eq(submission.id, id)).for("update");
    if (!current || current.deletedAt) return failCode("recordMissing", 404);
    if (current.playerId !== playerId) return failCode("recordForbidden", 403);
    const label = await submissionLabel(tx, id);
    await tx.update(submission).set({ deletedAt: new Date() }).where(eq(submission.id, id));
    await tx.insert(trashItem).values({
      kind: "record", targetId: id, label,
    }).onConflictDoNothing();
    await writeAudit(tx, actor, "玩家撤回挑战记录", `${label}\n- 撤回时状态：${statusLabel(current.status)}`);
    return { ok: true, data: { id } };
  });
}

type AdminCreateInput = PlayerSubmissionInput & { playerId?: number; status?: AdminReviewState };
export async function createAdminSubmission(actor: Actor, input: AdminCreateInput): Promise<Result<AdminRecord>> {
  const playerId = entityId(input.playerId);
  if (!playerId) return failure("请选择玩家。");
  const status = input.status && ACTIVE_STATUSES.has(input.status) ? input.status : "pending";
  const mark = status === "pending" ? "管理员添加待审核" : "管理员直录";
  const created = await createPlayerSubmission(actor, playerId, { ...input, kind: "run" }, { mark });
  if (!created.ok) return created;
  if (status === "pending") return created;
  const target = await db.select({ name: challenge.name }).from(challenge).where(eq(challenge.id, created.data.challengeId!)).limit(1);
  const reviewTags = status === "accepted" && target[0] && isExplicitFcName(target[0].name)
    ? [{ id: await nextEntityId("submission_tag"), kind: "badge" as const, text: "FC", color: "#ff9fd0" }]
    : undefined;
  return updateSubmission(actor, created.data.id, { status, reviewTags });
}

type AdminPatch = {
  status?: AdminReviewState; challengeId?: number; reviewTags?: ReviewTag[]; achievedAt?: string; videoUrl?: string;
  rawVideoUrl?: string | null; playerNote?: string | null; verifierNote?: string | null; duration?: string | null;
  reviewedAt?: string | null; opinionTier?: string | null; recommends?: boolean | null; deleted?: boolean;
};

export async function updateSubmission(actor: Actor, id: number, patch: AdminPatch): Promise<Result<AdminRecord>> {
  const rows = await db.select().from(submission).where(eq(submission.id, id)).limit(1);
  const current = rows[0];
  if (!current || (current.deletedAt && patch.deleted !== false)) return failure("记录不存在或已删除。", 404);
  if (patch.status && !ACTIVE_STATUSES.has(patch.status)) return failure("审核状态无效。");
  let targetChallengeId = current.challengeId;
  if (patch.challengeId !== undefined) {
    targetChallengeId = entityId(patch.challengeId) || null;
    if (targetChallengeId) {
      const targets = await db.select({ id: challenge.id }).from(challenge).where(and(eq(challenge.id, targetChallengeId), isNull(challenge.deletedAt))).limit(1);
      if (!targets[0]) return failure("目标挑战不存在或已删除。", 404);
    }
  }
  if ((patch.status === "accepted" || patch.status === "hidden") && !targetChallengeId) return failure("接收新挑战提案前，请先选择归属挑战。");

  const values: Partial<typeof submission.$inferInsert> = {};
  // 出了审核结论，「审核中」这个提示就没有意义了，跟着一起清掉。
  if (patch.status) { values.status = patch.status; values.reviewedBy = actor.id; values.reviewedAt = new Date(); values.reviewingBy = null; values.reviewingNote = null; values.reviewingAt = null; }
  if (patch.challengeId !== undefined) { values.challengeId = targetChallengeId; if (targetChallengeId) values.proposedTarget = null; }
  if (patch.achievedAt !== undefined) { const parsed = dateOnly(patch.achievedAt); if (!parsed) return failure("达成时间格式有误。"); values.achievedAt = parsed; }
  if (patch.videoUrl !== undefined) { const value = expandBilibiliVideoRef(clean(patch.videoUrl, 2_000)); if (!value || !validUrl(value)) return failure("挑战视频链接无效。"); values.videoUrl = value; }
  if (patch.rawVideoUrl !== undefined) { const value = optional(expandBilibiliVideoRef(clean(patch.rawVideoUrl, 2_000)), 2_000); if (value && !validUrl(value)) return failure("RAW 视频链接无效。"); values.rawVideoUrl = value; }
  if (patch.playerNote !== undefined) values.playerNote = optional(patch.playerNote, 4_000);
  if (patch.verifierNote !== undefined) values.verifierNote = optional(patch.verifierNote, 4_000);
  if (patch.duration !== undefined) values.duration = optional(patch.duration, 100);
  if (patch.reviewedAt !== undefined) {
    const value = optional(patch.reviewedAt, 40);
    const parsed = value ? new Date(`${value.replace(" ", "T").replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "")}+08:00`) : null;
    if (parsed && Number.isNaN(parsed.getTime())) return failure("审核时间格式有误。");
    values.reviewedAt = parsed;
  }
  if (patch.opinionTier !== undefined) { if (patch.opinionTier && !isRatedTier(patch.opinionTier)) return failure("难度建议无效。"); values.opinionTier = patch.opinionTier || null; }
  if (patch.recommends !== undefined) values.recommends = patch.recommends;
  if (patch.deleted !== undefined) values.deletedAt = patch.deleted ? new Date() : null;
  try {
    await db.transaction(async (tx) => {
      if (targetChallengeId) {
        const [target] = await tx.select({ tier: challenge.tierCode }).from(challenge)
          .where(eq(challenge.id, targetChallengeId)).for("share");
        if (patch.status === "accepted" && isTierCode(target?.tier)) values.verified = true;
      }
      if (Object.keys(values).length) await tx.update(submission).set(values).where(eq(submission.id, id));
      if (patch.reviewTags) {
        await tx.delete(submissionTag).where(and(eq(submissionTag.submissionId, id), inArray(submissionTag.kind, ["badge", "note"])));
        const tags = patch.reviewTags.filter((tag) => (tag.kind === "badge" || tag.kind === "note") && clean(tag.text, 200));
        /* 配色规则与单条追加那条路径（upsertSubmissionTag）逐字一致：同一个 FC
           从详情页整份提交和从审核列表单条追加进来，必须是同一个颜色。 */
        if (tags.length) await tx.insert(submissionTag).values(tags.map((tag) => ({
          submissionId: id,
          kind: tag.kind,
          text: clean(tag.text, 200),
          color: tag.kind === "note" ? null : fixedTagColor(clean(tag.text, 200)) ?? normalizeTagColor(tag.color) ?? null,
        })));
      }
      /*
       * 类型名、actor 与 detail 都走共享的审计模块，和 /review 那条路径完全一致。
       * 这里以前写的是 `审核${patch.status}`（拼出「审核rejected」）、actor 塞账户 UUID、
       * detail 只有一个裸 submission id —— 后台的 humanizeAudit 也认不出那种 id。
       */
      const label = await submissionLabel(tx, id);
      const type = patch.deleted === true ? "删除挑战记录"
        : patch.deleted === false ? "恢复挑战记录"
        : values.status ? reviewAuditType(values.status as AdminReviewState)
        : "修改挑战记录";
      const changes = diffLines([
        ...("status" in values ? [["状态", statusLabel(current.status), statusLabel(values.status)] as [string, unknown, unknown]] : []),
        ...("challengeId" in values ? [["归属挑战",
          current.challengeId ? await challengeLabel(tx, current.challengeId) : "新地图或挑战提案",
          targetChallengeId ? await challengeLabel(tx, targetChallengeId) : "新地图或挑战提案"] as [string, unknown, unknown]] : []),
        ...("achievedAt" in values ? [["达成时间", current.achievedAt, values.achievedAt] as [string, unknown, unknown]] : []),
        ...("videoUrl" in values ? [["挑战视频", current.videoUrl, values.videoUrl] as [string, unknown, unknown]] : []),
        ...("rawVideoUrl" in values ? [["RAW 视频", current.rawVideoUrl, values.rawVideoUrl] as [string, unknown, unknown]] : []),
        ...("playerNote" in values ? [["玩家备注", current.playerNote, values.playerNote] as [string, unknown, unknown]] : []),
        ...("verifierNote" in values ? [["审核备注", current.verifierNote, values.verifierNote] as [string, unknown, unknown]] : []),
        ...("duration" in values ? [["时长", current.duration, values.duration] as [string, unknown, unknown]] : []),
        ...("opinionTier" in values ? [["难度建议", current.opinionTier, values.opinionTier] as [string, unknown, unknown]] : []),
        ...("recommends" in values ? [["推荐", recommendLabel(current.recommends), recommendLabel(values.recommends)] as [string, unknown, unknown]] : []),
      ]);
      if (patch.reviewTags) changes.push(`- 审核标签：${patch.reviewTags.map((tag) => tag.text).join("、") || "已清空"}`);
      await writeAudit(tx, actor, type, [label, ...changes].join("\n"));
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("该玩家在目标挑战已有记录或待审核提交。", 409);
    throw error;
  }
  if (patch.deleted === true) return { ok: true, data: {
    id: current.id, challengeId: current.challengeId ?? null, playerId: current.playerId,
    achievedAt: current.achievedAt ? String(current.achievedAt).slice(0, 10) : "", videoUrl: current.videoUrl,
    rawVideoUrl: current.rawVideoUrl ?? undefined, playerNote: current.playerNote ?? undefined,
    verifierNote: current.verifierNote ?? undefined, status: current.status as AdminReviewState, verified: values.verified ?? current.verified,
    marks: [], createdAt: current.createdAt.toISOString(), reviewedAt: current.reviewedAt?.toISOString(),
    opinionTier: current.opinionTier && isRatedTier(current.opinionTier) ? current.opinionTier : undefined,
    recommends: current.recommends ?? undefined, duration: current.duration ?? undefined,
    proposedTarget: (current.proposedTarget ?? undefined) as ProposedChallengeTarget | undefined,
  } };
  const refreshed = (await listRuntimeSubmissions()).find((record) => record.id === id);
  if (refreshed) return { ok: true, data: refreshed };
  return { ok: true, data: {
    id: current.id, challengeId: targetChallengeId ?? null, playerId: current.playerId,
    achievedAt: (values.achievedAt as string | undefined) ?? (current.achievedAt ? String(current.achievedAt).slice(0, 10) : ""),
    videoUrl: (values.videoUrl as string | undefined) ?? current.videoUrl,
    rawVideoUrl: values.rawVideoUrl === undefined ? current.rawVideoUrl ?? undefined : values.rawVideoUrl ?? undefined,
    playerNote: values.playerNote === undefined ? current.playerNote ?? undefined : values.playerNote ?? undefined,
    verifierNote: values.verifierNote === undefined ? current.verifierNote ?? undefined : values.verifierNote ?? undefined,
    status: (patch.status ?? current.status) as AdminReviewState, verified: values.verified ?? current.verified, marks: [], createdAt: current.createdAt.toISOString(),
    reviewedAt: values.reviewedAt instanceof Date ? values.reviewedAt.toISOString() : current.reviewedAt?.toISOString(),
    opinionTier: patch.opinionTier === undefined ? (current.opinionTier && isRatedTier(current.opinionTier) ? current.opinionTier : undefined) : (patch.opinionTier && isRatedTier(patch.opinionTier) ? patch.opinionTier : undefined),
    recommends: patch.recommends === undefined ? current.recommends ?? undefined : patch.recommends ?? undefined,
    duration: values.duration === undefined ? current.duration ?? undefined : values.duration ?? undefined,
    proposedTarget: (targetChallengeId ? undefined : current.proposedTarget ?? undefined) as ProposedChallengeTarget | undefined,
    reviewTags: patch.reviewTags,
  } };
}
