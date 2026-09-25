import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/client";
import { submissionToken } from "../../../db/schema/submission-token";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { isAdminRole } from "../../../../../shared/src/account-roles";
import { currentAccount } from "../session";
import { hashSubmissionToken, newSubmissionToken, SUBMISSION_TOKEN_TTL } from "../submission-token";

async function admin() {
  const owner = await currentAccount();
  return owner && isAdminRole(owner.role) ? owner : null;
}
const denied = () => jsonResponse({ ok: false, error: "无权限：仅管理员可管理补录授权。" }, { status: 403 });

export async function GET() {
  const owner = await admin();
  if (!owner) return denied();
  const tokens = await db.select({ id: submissionToken.id, createdAt: submissionToken.createdAt,
    expiresAt: submissionToken.expiresAt, revokedAt: submissionToken.revokedAt }).from(submissionToken)
    .where(and(eq(submissionToken.accountId, owner.id), isNull(submissionToken.revokedAt))).orderBy(desc(submissionToken.id));
  return jsonResponse({ ok: true, tokens });
}
export async function POST() {
  const owner = await admin();
  if (!owner) return denied();
  const token = newSubmissionToken(), expiresAt = new Date(Date.now() + SUBMISSION_TOKEN_TTL);
  const [created] = await db.insert(submissionToken).values({ accountId: owner.id, tokenHash: hashSubmissionToken(token), expiresAt })
    .returning({ id: submissionToken.id });
  return jsonResponse({ ok: true, id: created.id, token, expiresAt }, { status: 201 });
}
export async function DELETE(request: ApiRequest) {
  const owner = await admin();
  if (!owner) return denied();
  const id = request.body?.id;
  if (!Number.isSafeInteger(id) || Number(id) < 1) return jsonResponse({ ok: false, error: "授权编号无效。" }, { status: 400 });
  const rows = await db.update(submissionToken).set({ revokedAt: new Date() })
    .where(and(eq(submissionToken.id, id as number), eq(submissionToken.accountId, owner.id))).returning({ id: submissionToken.id });
  return jsonResponse({ ok: rows.length === 1 }, { status: rows.length ? 200 : 404 });
}
