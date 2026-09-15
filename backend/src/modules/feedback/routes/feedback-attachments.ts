import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { and, eq, isNull } from "drizzle-orm";
import { currentAccount } from "../../auth/session";
import { db } from "../../../db/client";
import { feedbackAttachment } from "../../../db/schema/index";
import { createFeedbackAttachment, MAX_ATTACHMENT_BYTES } from "../feedback-service";
import { deleteObject, ossConfig } from "../../../integrations/oss";
import { fail } from "../../../../../shared/src/api-errors";

async function uploader() {
  const owner = await currentAccount();
  return owner?.status === "active" ? owner : null;
}

/** 上传一张反馈配图。要求登录：匿名反馈仍可提交，但不能带图。 */
export async function POST(request: ApiRequest) {
  const owner = await uploader();
  if (!owner) return jsonResponse(fail("signInToUpload"), { status: 401 });
  const file = await request.file({ limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 } });
  if (!file || file.fieldname !== "file") return jsonResponse(fail("attachmentNotImage"), { status: 400 });
  const bytes = await file.toBuffer();
  if (file.file.truncated) return jsonResponse({ ok: false, error: "图片过大。" }, { status: 413 });
  const result = await createFeedbackAttachment(bytes, { id: owner.id });
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, attachment: result.data }, { status: 201 });
}

/** 撤下还没提交的图片：连 OSS 上的对象一起删，别在桶里留孤儿。 */
export async function DELETE(request: ApiRequest) {
  const owner = await uploader();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  const id = requestUrl(request).searchParams.get("id")?.trim();
  if (!id) return jsonResponse(fail("attachmentMissingId"), { status: 400 });
  // 只删自己上传、且尚未绑定到反馈上的那一行；已提交的附件不能从这里撤。
  const removed = await db.delete(feedbackAttachment).where(and(
    eq(feedbackAttachment.id, pathEntityId(id)),
    eq(feedbackAttachment.uploaderAccountId, owner.id),
    isNull(feedbackAttachment.reportId),
  )).returning();
  const config = ossConfig();
  if (config && removed[0]) await deleteObject(config, removed[0].objectKey).catch(() => undefined);
  return jsonResponse({ ok: true });
}
