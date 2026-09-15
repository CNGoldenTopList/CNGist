/** 后台数据的按域读取。**没有「取全部」这个入口**：每个面板只查自己要的那一份。 */
import { and, asc, count, eq, gte, ilike, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/client";
import { account, adminTask, auditLog, feedbackReport, player, playerClaimRequest, trashItem, trashVote } from "../../db/schema/index";
import type { AuditItem, AuditPage, PlayerClaimRequestItem, PlayerDirectory, TaskBoard, TrashItem } from "../../../../shared/src/admin";
import { listRuntimeSubmissions } from "../records/submission-service";
import { listAttachmentsByReport } from "../feedback/feedback-service";

export async function loadManagedAccounts(query: string) {
  const q = query.trim().slice(0, 200);
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(q);
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return db.select({ id: account.id, displayName: account.displayName, email: account.email, role: account.role, status: account.status })
    .from(account)
    .where(q ? or(ilike(account.displayName, pattern), ilike(account.email, pattern), /^[1-9]\d*$/.test(q) ? eq(account.id, Number(q)) : undefined)
      : inArray(account.role, ["admin", "super_admin"]))
    .orderBy(asc(account.displayName), asc(account.id)).limit(50);
}

/** 审核队列：待审核、被隐藏，以及经站内提交的已通过记录。 */
export async function loadReviewQueue() {
  return listRuntimeSubmissions();
}

/** 玩家管理：非正常状态与认领账户的联系方式。 */
export async function loadPlayerDirectory(): Promise<PlayerDirectory> {
  const [playerRows, contactRows] = await Promise.all([
    db.select({ id: player.id, status: player.status }).from(player).where(isNull(player.deletedAt)),
    // 绑定邮箱与 QQ 属于认领该玩家的账户，后台只读展示，不从这里改。
    db.select({ playerId: account.claimedPlayerId, email: account.email, qqLinked: account.qqLinked })
      .from(account).where(isNotNull(account.claimedPlayerId)),
  ]);
  return {
    statuses: Object.fromEntries(playerRows.filter((row) => row.status !== "normal").map((row) => [row.id, row.status])) as PlayerDirectory["statuses"],
    contacts: Object.fromEntries(contactRows.map((row) => [row.playerId!, { email: row.email ?? undefined, qqLinked: row.qqLinked }])),
  };
}

/** 新 B 站身份申请：按创建时间正序，管理员先看最早提交的。 */
export async function loadPlayerClaimRequests(): Promise<PlayerClaimRequestItem[]> {
  const rows = await db.select({
    id: playerClaimRequest.id, accountName: account.displayName, accountEmail: account.email,
    bilibiliUid: playerClaimRequest.bilibiliUid, bilibiliName: playerClaimRequest.bilibiliName,
    nameSource: playerClaimRequest.nameSource, status: playerClaimRequest.status,
    createdAt: playerClaimRequest.createdAt, reviewNote: playerClaimRequest.reviewNote,
  }).from(playerClaimRequest)
    .leftJoin(account, eq(account.id, playerClaimRequest.accountId))
    .orderBy(asc(playerClaimRequest.createdAt));
  return rows.map((row) => ({
    id: row.id, accountName: row.accountName ?? "未知账户", accountEmail: row.accountEmail ?? undefined,
    bilibiliUid: row.bilibiliUid, bilibiliName: row.bilibiliName,
    nameSource: row.nameSource === "manual" ? "manual" : "fetched",
    status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
    createdAt: row.createdAt.toISOString(), reviewNote: row.reviewNote ?? undefined,
  }));
}

/** 回收站：条目与它们已有的确认票。 */
export async function loadTrash(): Promise<TrashItem[]> {
  const [items, votes] = await Promise.all([
    db.select().from(trashItem).orderBy(asc(trashItem.deletedAt)),
    db.select().from(trashVote),
  ]);
  const votesByItem = new Map<number, number[]>();
  for (const vote of votes) votesByItem.set(vote.trashItemId, [...(votesByItem.get(vote.trashItemId) ?? []), vote.accountId]);
  return items.map((row) => ({
    id: row.id, kind: row.kind as TrashItem["kind"], targetId: row.targetId,
    label: row.label, deletedAt: row.deletedAt.toISOString(), votes: votesByItem.get(row.id) ?? [],
  }));
}

/** 待办面板：未完成、已完成与待处理反馈（含配图）。 */
export async function loadTaskBoard(): Promise<TaskBoard> {
  const [tasks, feedback] = await Promise.all([
    db.select().from(adminTask).orderBy(asc(adminTask.createdAt)),
    db.select().from(feedbackReport).orderBy(asc(feedbackReport.createdAt)),
  ]);
  const attachments = await listAttachmentsByReport(feedback.map((row) => row.id));
  return {
    otherTasks: tasks.filter((row) => !row.completedAt).map((row) => ({
      id: row.id, type: row.type, title: row.title, detail: row.detail,
      createdAt: row.createdAt.toISOString(), href: row.href ?? undefined,
    })),
    completedTasks: tasks.filter((row) => row.completedAt).map((row) => ({
      id: row.id, type: row.type, title: row.title, detail: row.detail,
      createdAt: row.createdAt.toISOString(), href: row.href ?? undefined,
      completedAt: row.completedAt!.toISOString(), completedBy: row.completedByLabel ?? undefined,
    })),
    feedbackReports: feedback.map((row) => ({
      id: row.id, title: row.title, detail: row.detail, pageUrl: row.pageUrl ?? undefined,
      reporter: row.reporter, createdAt: row.createdAt.toISOString(),
      status: row.status as "pending" | "resolved",
      handledBy: row.handledBy ?? undefined, handledAt: row.handledAt?.toISOString(),
      attachments: attachments.get(row.id),
    })),
  };
}

/** 审计日志：分页读取。审计只增不减，**必须分页**——旧实现一次全表拉， */
export async function loadAuditPage(options: {
  from?: string; to?: string; type?: string; limit?: number; offset?: number;
}): Promise<AuditPage> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = [];
  // 日期是北京时区的当天边界；审计时间戳带时区，直接比较即可。
  if (options.from) filters.push(gte(auditLog.at, new Date(`${options.from}T00:00:00+08:00`)));
  if (options.to) filters.push(lte(auditLog.at, new Date(`${options.to}T23:59:59.999+08:00`)));
  if (options.type) filters.push(eq(auditLog.type, options.type));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totals] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(asc(auditLog.at)).limit(limit).offset(offset),
    db.select({ n: count() }).from(auditLog).where(where),
  ]);
  const items: AuditItem[] = rows.map((row) => ({
    id: row.id, at: row.at.toISOString(), type: row.type,
    detail: row.detail, actor: row.actor,
  }));
  return { items, total: totals[0]?.n ?? 0 };
}
