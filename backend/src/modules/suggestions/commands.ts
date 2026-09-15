/** commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { eq } from "drizzle-orm";
import { suggestion } from "../../db/schema/index";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import { suggestionDueAt } from "../../../../shared/src/suggestions";
import { writeAudit } from "../admin/audit";
import { Admin, Result, failure, done, clean, optional } from "../admin/common";

export async function deleteSuggestion(admin: Admin, id: number): Promise<Result> {
  return commandTransaction(async (tx) => {
    const [before] = await tx.delete(suggestion).where(eq(suggestion.id, id)).returning();
    if (!before) return failure("意见不存在。", 404);
    await writeAudit(tx, admin, "删除意见箱意见", `${before.title}（${before.id}）\n- 原状态：${before.state}\n- 作者：${before.author}`);
    return done(undefined);
  });
}

export type SuggestionDurationInput = { dueAt?: unknown; extendDays?: unknown };

export async function setSuggestionDueAt(admin: Admin, id: number, input: SuggestionDurationInput): Promise<Result<{ dueAt: string }>> {
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(suggestion).where(eq(suggestion.id, id)).limit(1);
    const before = rows[0];
    if (!before) return failure("意见不存在。", 404);
    if (before.kind === "GENERAL") return failure("通用建议不设截止时间。", 409);
    if (before.state === "DECIDED") return failure("该意见已经决定，无法再调整投票时间。", 409);
    const current = suggestionDueAt(before.createdAt, before.dueAt);
    let dueAt: Date;
    const explicit = clean(input.dueAt, 40);
    if (explicit) {
      // datetime-local 不带时区，按北京时间读；带了偏移量的 ISO 串原样解析。
      const parsed = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(explicit) ? `${explicit.replace(" ", "T")}+08:00` : explicit);
      if (Number.isNaN(parsed.getTime())) return failure("截止时间格式有误。");
      dueAt = parsed;
    } else {
      const days = Number(input.extendDays);
      if (!Number.isFinite(days) || days === 0) return failure("请填写有效的延长天数或截止时间。");
      if (!current) return failure("这条意见没有可用的创建时间，请直接指定截止时间。");
      dueAt = new Date(current.getTime() + days * 86_400_000);
    }
    await tx.update(suggestion).set({ dueAt }).where(eq(suggestion.id, id));
    await writeAudit(tx, admin, "调整意见投票截止时间",
      `${before.title}\n- 截止时间：${current ? current.toISOString() : "无"} → ${dueAt.toISOString()}`);
    return done({ dueAt: dueAt.toISOString() });
  });
}

export type SuggestionDecideInput = { decision?: unknown; note?: unknown; resultTier?: unknown };

export async function decideSuggestion(admin: Admin, id: number, input: SuggestionDecideInput): Promise<Result> {
  const decision = clean(input.decision, 32);
  if (decision !== "ACCEPTED" && decision !== "REJECTED") return failure("决定结果无效。");
  const note = optional(input.note, 2_000);
  const requestedTier = clean(input.resultTier, 32);
  if (requestedTier && !isDifficultyCode(requestedTier)) return failure("结果难度无效。");
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(suggestion).where(eq(suggestion.id, id)).limit(1);
    const before = rows[0];
    if (!before) return failure("意见不存在。", 404);
    if (before.state === "DECIDED") return failure("该意见已经决定过。", 409);
    const resultTier = decision === "ACCEPTED" ? requestedTier || before.suggestedTier : null;
    await tx.update(suggestion).set({ state: "DECIDED", decision, decisionNote: note, resultTier }).where(eq(suggestion.id, id));
    await writeAudit(tx, admin, decision === "ACCEPTED" ? "意见箱：同意" : "意见箱：驳回",
      `${before.title}${resultTier ? `\n- 结果难度：${before.currentTier || "未定级"} → ${resultTier}` : ""}${note ? `\n- 说明：${note}` : ""}`);
    return done(undefined);
  });
}
