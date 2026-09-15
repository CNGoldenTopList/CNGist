import { entityId } from "../../../../shared/src/entity-id";
/** commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { eq, sql } from "drizzle-orm";
import { qaEntry } from "../../db/schema/index";
import { isQaCategory } from "../../../../shared/src/qa";
import { diffLines, writeAudit } from "../admin/audit";
import { Admin, Result, failure, done, clean, optional } from "../admin/common";

export async function saveQaEntry(admin: Admin, input: Record<string, unknown>): Promise<Result> {
  const id = entityId(input.id);
  return commandTransaction(async (tx) => {
    const old = id ? (await tx.select().from(qaEntry).where(eq(qaEntry.id, id)).for("update"))[0] : null;
    if (id && !old) return failure("条目不存在。", 404);
    if (input.remove === true) {
      if (!old) return failure("请选择要删除的条目。");
      await tx.delete(qaEntry).where(eq(qaEntry.id, old.id));
      await writeAudit(tx, admin, "删除 Q&A 条目", old.question);
      return done(undefined);
    }
    const question = clean(input.question, 300);
    const answer = clean(input.answer, 8000);
    if (!question || !answer) return failure("问题与回答都不能为空。");
    const category = isQaCategory(input.category) ? input.category : old?.category;
    if (!category) return failure("请选择分组。");
    // 未传排序时：编辑保留原值，新增排到本分组末尾——两块分组各排各的。
    const nextPosition = (await tx.select({ value: sql<number>`COALESCE(MAX(${qaEntry.position}), -1) + 1` })
      .from(qaEntry).where(eq(qaEntry.category, category)))[0]?.value ?? 0;
    const position = typeof input.position === "number" && Number.isFinite(input.position)
      ? Math.trunc(input.position)
      : old?.position ?? Number(nextPosition);
    if (position < -9999 || position > 9999) return failure("排序值超出范围。");
    const value = {
      category,
      question,
      answer,
      questionEn: optional(input.questionEn, 300),
      answerEn: optional(input.answerEn, 8000),
      position,
      updatedAt: new Date(),
    };
    if (old) await tx.update(qaEntry).set(value).where(eq(qaEntry.id, old.id));
    else await tx.insert(qaEntry).values(value);
    await writeAudit(tx, admin, old ? "修改 Q&A 条目" : "新增 Q&A 条目",
      `${value.question}\n${diffLines([
        ["分组", old?.category, value.category],
        ["问题", old?.question, value.question],
        ["回答", old?.answer, value.answer],
        ["英文问题", old?.questionEn, value.questionEn],
        ["英文回答", old?.answerEn, value.answerEn],
        ["排序", old?.position, value.position],
      ]).join("\n")}`);
    return done(undefined);
  });
}
