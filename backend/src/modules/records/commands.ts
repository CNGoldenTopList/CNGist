/** commands 模块。 */
import { isTierCode } from "../../../../shared/src/tiers";
import { commandTransaction } from "../admin/transaction";
import { entityId } from "../../../../shared/src/entity-id";
import { preservesClearRecord } from "../../../../shared/src/challenge-graph";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { challenge, map, player, submission, submissionTag } from "../../db/schema/index";
import { FC_TAG_COLOR, fixedTagColor, normalizeTagColor, tagIdentity } from "../../../../shared/src/review-tags";
import type { AdminReviewState } from "../../../../shared/src/admin";
import { challengeLabel, reviewAuditType, submissionLabel, writeAudit } from "../admin/audit";
import { Admin, Result, optional, clean, failure, done, REVIEW_STATUSES, idArray, tierCode, isExplicitFcName, isUniqueViolation } from "../admin/common";

export type TagUpsertInput = { tagId?: unknown; kind?: unknown; text?: unknown; color?: unknown };

export async function upsertSubmissionTag(admin: Admin, submissionId: number, input: TagUpsertInput): Promise<Result<{ id: number }>> {
  const tagId = entityId(input.tagId);
  const kind = clean(input.kind, 32) || "badge";
  if (kind !== "badge" && kind !== "note") return failure("标签类型无效。");
  const text = clean(input.text, 200);
  if (!text) return failure("请填写标签内容。");
  /* note 不带颜色；badge 的语义固定标签用它们自己的色，其余听调用方的 —— 但
     只认 #rrggbb：这个值原样进 --tag-tone，别的字符串会毁掉整个标签的样式。 */
  const color = kind === "note" ? null : fixedTagColor(text) ?? normalizeTagColor(input.color) ?? null;
  return commandTransaction(async (tx) => {
    const rows = await tx.select({ id: submission.id }).from(submission).where(and(eq(submission.id, submissionId), isNull(submission.deletedAt))).limit(1);
    if (!rows[0]) return failure("记录不存在或已删除。", 404);
    const label = await submissionLabel(tx, submissionId);
    const siblings = await tx.select().from(submissionTag)
      .where(and(eq(submissionTag.submissionId, submissionId), inArray(submissionTag.kind, ["badge", "note"])));
    const clash = siblings.find((row) => row.id !== tagId && tagIdentity(row.text) === tagIdentity(text));
    if (clash) return failure(`这条记录已经有「${clash.text}」这个标签了。`, 409);
    if (tagId) {
      const existing = siblings.find((row) => row.id === tagId);
      if (!existing) return failure("标签不存在。", 404);
      await tx.update(submissionTag).set({ kind, text, color }).where(eq(submissionTag.id, tagId));
      await writeAudit(tx, admin, "修改标签", `${label}\n- ${existing.text} → ${text}`);
      return done({ id: tagId });
    }
    const inserted = await tx.insert(submissionTag).values({ submissionId, kind, text, color }).returning({ id: submissionTag.id });
    await writeAudit(tx, admin, "追加标签", `${label}\n- 新增标签：${text}`);
    return done({ id: inserted[0].id });
  });
}

export type ReviewInput = { status?: unknown; challengeId?: unknown; retainedIds?: unknown };

export async function reviewSubmission(admin: Admin, id: number, input: ReviewInput): Promise<Result> {
  const status = clean(input.status, 32) as AdminReviewState;
  if (status !== "pending" && !REVIEW_STATUSES.includes(status)) return failure("审核状态无效。");
  if (status === "pending" && (input.challengeId !== undefined || input.retainedIds !== undefined)) {
    return failure("退回待审核时不能更改归属或其他记录。");
  }
  const destination = entityId(input.challengeId);
  const retainedIds = Array.isArray(input.retainedIds) ? idArray(input.retainedIds, 2_000) : null;
  try {
    return await commandTransaction(async (tx) => {
      const rows = await tx.select().from(submission).where(eq(submission.id, id)).limit(1);
      const current = rows[0];
      if (!current || current.deletedAt) return failure("记录不存在或已删除。", 404);
      if (status === "pending" && current.status !== "accepted" && current.status !== "hidden") {
        return failure("只有已通过或已隐藏的记录可以退回待审核。", 409);
      }
      const targetChallengeId = destination || current.challengeId;
      if ((status === "accepted" || status === "hidden") && !targetChallengeId) return failure("接收新挑战提案前，请先选择归属挑战。");

      let targetName = "";
      let targetMapId: number | null = null;
      let targetTier: string | null = null;
      if (targetChallengeId) {
        const targets = await tx.select({ id: challenge.id, name: challenge.name, mapId: challenge.mapId, tier: challenge.tierCode }).from(challenge)
          .where(and(eq(challenge.id, targetChallengeId), isNull(challenge.deletedAt))).limit(1).for("share");
        if (!targets[0]) return failure("目标挑战不存在或已删除。", 404);
        targetName = targets[0].name;
        targetMapId = targets[0].mapId;
        targetTier = targets[0].tier;
      }

      /* 拒绝只是一个审核结论，不是删除：记录留在库里、留在「已审核记录」里，
         玩家也能在个人页看到并改完重投。真要清掉它得走回收站那条命令。 */
      await tx.update(submission).set({
        status, challengeId: targetChallengeId, proposedTarget: targetChallengeId ? null : current.proposedTarget,
        ...(status === "accepted" && isTierCode(targetTier) ? { verified: true } : {}),
        ...(status === "pending" ? { verified: false } : {}),
        reviewedBy: status === "pending" ? null : admin.id, reviewedAt: status === "pending" ? null : new Date(),
        // 审核结论变更或退回队列时，清除原认领提示。
        reviewingBy: null, reviewingNote: null, reviewingAt: null,
      }).where(eq(submission.id, id));

      if (status === "accepted" && isExplicitFcName(targetName)) {
        const existing = await tx.select().from(submissionTag)
          .where(and(eq(submissionTag.submissionId, id), eq(submissionTag.kind, "badge")));
        if (!existing.some((tag) => /^(FC|月莓|moon)$/i.test(tag.text.trim()))) {
          await tx.insert(submissionTag).values({ submissionId: id, kind: "badge", text: "FC", color: FC_TAG_COLOR });
        }
      }

      // 同图冲突隐藏改由服务端按库里的记录计算，历史导入记录同样覆盖得到。
      let hidden: number[] = [];
      if (retainedIds && targetMapId) {
        const siblings = await tx.select({ id: submission.id, challengeId: submission.challengeId, name: challenge.name, tier: challenge.tierCode }).from(submission)
          .innerJoin(challenge, eq(challenge.id, submission.challengeId))
          .where(and(
            eq(submission.playerId, current.playerId), eq(challenge.mapId, targetMapId),
            ne(submission.id, id), isNull(submission.deletedAt),
            inArray(submission.status, ["pending", "accepted"]),
          ));
        hidden = siblings.filter(row => row.challengeId !== targetChallengeId && !preservesClearRecord(row, { name: targetName, tier: targetTier }) && !retainedIds.includes(row.id)).map(row => row.id);
        if (hidden.length) {
          await tx.update(submission).set({ status: "hidden", reviewedBy: admin.id, reviewedAt: new Date(), reviewingBy: null, reviewingNote: null, reviewingAt: null })
            .where(inArray(submission.id, hidden));
          await tx.insert(submissionTag).values(hidden.map((siblingId) => ({ submissionId: siblingId, kind: "mark", text: "同地图挑战冲突隐藏" })));
        }
      }

      const playerRow = await tx.select({ name: player.name }).from(player).where(eq(player.id, current.playerId)).limit(1);
      const label = targetChallengeId ? await challengeLabel(tx, targetChallengeId) : "新地图或挑战提案";
      const moved = destination && destination !== current.challengeId ? `\n- 归属挑战：${current.challengeId ? await challengeLabel(tx, current.challengeId) : "提案"} → ${label}` : "";
      await writeAudit(tx, admin, reviewAuditType(status), `${playerRow[0]?.name ?? current.playerId} · ${label}${moved}${hidden.length ? `\n- 同图冲突隐藏：${hidden.length} 条` : ""}`);
      return done(undefined);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("该玩家在目标挑战已有记录或待审核提交。", 409);
    throw error;
  }
}

export async function setSubmissionReviewing(admin: Admin, id: number, input: { active?: unknown; note?: unknown }): Promise<Result> {
  const active = input.active !== false;
  const note = optional(input.note, 500);
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(submission).where(eq(submission.id, id)).limit(1);
    const current = rows[0];
    if (!current || current.deletedAt) return failure("记录不存在或已删除。", 404);
    if (active && current.status !== "pending") return failure("只有待审核的记录可以标记为审核中。");
    await tx.update(submission).set(active
      ? { reviewingBy: admin.id, reviewingNote: note, reviewingAt: current.reviewingBy === admin.id && current.reviewingAt ? current.reviewingAt : new Date() }
      : { reviewingBy: null, reviewingNote: null, reviewingAt: null },
    ).where(eq(submission.id, id));
    const label = await submissionLabel(tx, id);
    await writeAudit(tx, admin, active ? "标记审核中" : "取消审核中", `${label}${active && note ? `\n- 备注：${note}` : ""}`);
    return done(undefined);
  });
}
