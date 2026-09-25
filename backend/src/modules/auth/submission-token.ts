import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { account } from "../../db/schema/auth";
import { submissionToken } from "../../db/schema/submission-token";
import { isAdminRole } from "../../../../shared/src/account-roles";

export const SUBMISSION_TOKEN_TTL = 90 * 86400000;
export const hashSubmissionToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newSubmissionToken = () => `cngclip_${randomBytes(32).toString("base64url")}`;

/** 独立鉴权，不回退 Cookie，也不注册到 currentSession。 */
export async function submissionTokenOwner(authorization: string | undefined) {
  const match = /^Bearer (cngclip_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
  if (!match) return null;
  const [owner] = await db.select({ id: account.id, displayName: account.displayName, role: account.role })
    .from(submissionToken).innerJoin(account, eq(account.id, submissionToken.accountId))
    .where(and(eq(submissionToken.tokenHash, hashSubmissionToken(match[1])),
      gt(submissionToken.expiresAt, new Date()), isNull(submissionToken.revokedAt), eq(account.status, "active"))).limit(1);
  return owner && isAdminRole(owner.role) ? owner : null;
}
