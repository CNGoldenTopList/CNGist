/** tasks 模块。 */
import { commandTransaction } from "./transaction";
import { eq } from "drizzle-orm";
import { adminTask, feedbackReport } from "../../db/schema/index";
import { writeAudit } from "./audit";
import { Admin, Result, failure, done } from "./common";

export async function completeTask(admin: Admin, id: number): Promise<Result> {
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(adminTask).where(eq(adminTask.id, id)).limit(1);
    const task = rows[0];
    if (!task) return failure("待办不存在。", 404);
    if (task.completedAt) return failure("该待办已完成。", 409);
    await tx.update(adminTask).set({ completedAt: new Date(), completedBy: admin.id, completedByLabel: admin.displayName }).where(eq(adminTask.id, id));
    await writeAudit(tx, admin, "完成待办", `${task.type || "其他待办"}：${task.title}`);
    return done(undefined);
  });
}

export async function resolveFeedbackReport(admin: Admin, id: number): Promise<Result> {
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(feedbackReport).where(eq(feedbackReport.id, id)).limit(1);
    const report = rows[0];
    if (!report) return failure("反馈不存在。", 404);
    if (report.status === "resolved") return failure("该反馈已处理。", 409);
    const now = new Date();
    await tx.update(feedbackReport).set({ status: "resolved", handledBy: admin.id, handledAt: now }).where(eq(feedbackReport.id, id));
    await tx.insert(adminTask).values({
      type: "玩家反馈", title: report.title, detail: report.detail,
      href: report.pageUrl, createdAt: report.createdAt, completedAt: now,
      completedBy: admin.id, completedByLabel: admin.displayName,
    }).onConflictDoNothing();
    await writeAudit(tx, admin, "处理玩家反馈", `${report.title}\n- 提交者：${report.reporter}\n- 页面：${report.pageUrl || "未填写"}`);
    return done(undefined);
  });
}
