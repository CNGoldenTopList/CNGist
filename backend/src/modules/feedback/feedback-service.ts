import { nextEntityId } from "../../db/ids";
import { imageUrl, storeImage } from "../assets/service";
import { and, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { auditLog, feedbackAttachment, feedbackReport } from "../../db/schema/index";
import { ossConfig, uploadImage } from "../../integrations/oss";
import type { FeedbackAttachment, FeedbackReport } from "../../../../shared/src/admin";
import { fail, type ApiErrorCode, type ApiFailure } from "../../../../shared/src/api-errors";

type Result<T> = { ok: true; data: T } | (ApiFailure & { status: number }) | { ok: false; error: string; code?: undefined; status: number };
function failure(error: string, status = 400): Result<never> { return { ok: false, error, status }; }
/** 带错误码的失败：界面会按当前语言翻译。 */
function failCode(code: ApiErrorCode, status = 400): Result<never> { return { ...fail(code), status }; }
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 单张图片上限与单条反馈的张数上限。 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REPORT = 4;
/** 一小时内允许的未绑定上传数，挡住只传图不提交的刷量。 */
const MAX_PENDING_UPLOADS_PER_HOUR = 20;

function toAttachment(row: typeof feedbackAttachment.$inferSelect): FeedbackAttachment {
  return { id: row.id, url: imageUrl(row.objectKey)!, contentType: row.contentType, bytes: row.bytes };
}

function toReport(row: typeof feedbackReport.$inferSelect, attachments: FeedbackAttachment[] = []): FeedbackReport {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    pageUrl: row.pageUrl ?? undefined,
    reporter: row.reporter,
    createdAt: row.createdAt.toISOString(),
    status: row.status as FeedbackReport["status"],
    handledBy: row.handledBy ?? undefined,
    handledAt: row.handledAt?.toISOString(),
    attachments: attachments.length ? attachments : undefined,
  };
}

/** 收一张图片：先传 OSS，再落一行未绑定的附件。返回的 id 才是提交反馈时认的凭据 —— */
export async function createFeedbackAttachment(bytes: Buffer, owner: { id: number }): Promise<Result<FeedbackAttachment>> {
  const config = ossConfig();
  if (!config) return failCode("uploadNotConfigured", 503);
  if (!bytes.length) return failCode("imageEmpty");
  if (bytes.length > MAX_ATTACHMENT_BYTES) return failure(`单张图片不能超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB。`, 413);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [pending] = await db.select({ n: count() }).from(feedbackAttachment).where(and(
    eq(feedbackAttachment.uploaderAccountId, owner.id),
    isNull(feedbackAttachment.reportId),
    gt(feedbackAttachment.createdAt, hourAgo),
  ));
  if ((pending?.n ?? 0) >= MAX_PENDING_UPLOADS_PER_HOUR) return failCode("uploadThrottled", 429);

  let uploaded;
  try {
    uploaded = await storeImage(bytes, "feedback");
  } catch (error) {
    return failure(error instanceof Error ? error.message : "图片上传失败。", 502);
  }
  const id = await nextEntityId("feedback_attachment");
  await db.insert(feedbackAttachment).values({
    id, uploaderAccountId: owner.id, objectKey: uploaded.key,
    contentType: uploaded.contentType, bytes: uploaded.bytes,
  });
  return { ok: true, data: { id, url: uploaded.url, contentType: uploaded.contentType, bytes: uploaded.bytes } };
}

/** 玩家反馈只相信服务端会话里的账户，不接受客户端传来的身份字段。 */
export async function createFeedbackReport(
  input: { title?: unknown; detail?: unknown; pageUrl?: unknown; attachmentIds?: unknown },
  owner: { id: number; displayName: string } | null,
): Promise<Result<FeedbackReport>> {
  const title = clean(input.title, 200);
  const detail = clean(input.detail, 10_000);
  const pageUrl = clean(input.pageUrl, 2_000) || null;
  const attachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0).slice(0, MAX_ATTACHMENTS_PER_REPORT)
    : [];
  if (!title) return failCode("reportTitleRequired");
  if (!detail) return failCode("reportDetailRequired");
  if (attachmentIds.length && !owner) return failCode("signInToUpload", 401);
  const id = await nextEntityId("feedback_report");
  const reporter = owner?.displayName || "匿名玩家";
  let attachments: FeedbackAttachment[] = [];
  await db.transaction(async (tx) => {
    await tx.insert(feedbackReport).values({
      id, title, detail, pageUrl, reporter, reporterAccountId: owner?.id ?? null,
    });
    if (attachmentIds.length && owner) {
      // 只绑定这个账户自己传上来、且尚未绑定过的行；别人的 id 和已用过的 id 都会被这里挡掉。
      const bound = await tx.update(feedbackAttachment).set({ reportId: id }).where(and(
        inArray(feedbackAttachment.id, attachmentIds),
        eq(feedbackAttachment.uploaderAccountId, owner.id),
        isNull(feedbackAttachment.reportId),
      )).returning();
      attachments = bound.map(toAttachment);
    }
    await tx.insert(auditLog).values({
      type: "玩家反馈",
      detail: `${title}\n- 页面：${pageUrl || "未填写"}\n- 内容：${detail}${attachments.length ? `\n- 附图：${attachments.length} 张` : ""}`,
      actor: reporter,
      sourceKey: `feedback-${id}`,
    });
  });
  const rows = await db.select().from(feedbackReport).where(eq(feedbackReport.id, id)).limit(1);
  return { ok: true, data: toReport(rows[0]!, attachments) };
}

/** 后台读取用：一次查出这批反馈的所有附件。 */
export async function listAttachmentsByReport(reportIds: number[]) {
  const byReport = new Map<number, FeedbackAttachment[]>();
  if (!reportIds.length) return byReport;
  const rows = await db.select().from(feedbackAttachment).where(inArray(feedbackAttachment.reportId, reportIds));
  for (const row of rows) {
    if (!row.reportId) continue;
    byReport.set(row.reportId, [...(byReport.get(row.reportId) ?? []), toAttachment(row)]);
  }
  return byReport;
}
