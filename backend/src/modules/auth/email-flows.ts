/** 邮箱验证与密码找回。 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, authIdentity, emailToken } from "../../db/schema/index";
import { mailEnabled, sendMail } from "../../integrations/mail/send";
import { mailSubjects, passwordChangedTemplate, resetPasswordTemplate, verifyEmailTemplate } from "../../integrations/mail/templates";
import { hashPassword } from "./password";
import { appOrigin } from "./providers";
import { fail, type ApiFailure } from "../../../../shared/src/api-errors";

export type TokenPurpose = "verify" | "reset";

const TTL_MINUTES = 30;
/** 同一账户同一用途的重发间隔，防止被人拿来轰炸别人的信箱。 */
const RESEND_COOLDOWN_MS = 60_000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function issueToken(accountId: number, purpose: TokenPurpose, email: string) {
  const recent = await db.select({ createdAt: emailToken.createdAt })
    .from(emailToken)
    .where(and(eq(emailToken.accountId, accountId), eq(emailToken.purpose, purpose), isNull(emailToken.consumedAt)))
    .orderBy(desc(emailToken.createdAt)).limit(1);
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) return null;

  const token = randomBytes(32).toString("base64url");
  await db.insert(emailToken).values({
    accountId, purpose, tokenHash: hashToken(token), email,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
  });
  return token;
}

/** 取出并作废一个令牌。同时校验签发时的邮箱与账户当前邮箱一致——改过邮箱则旧链接失效。 */
async function consumeToken(token: string, purpose: TokenPurpose) {
  const rows = await db.select({ token: emailToken, owner: account })
    .from(emailToken)
    .innerJoin(account, eq(account.id, emailToken.accountId))
    .where(and(
      eq(emailToken.tokenHash, hashToken(token)),
      eq(emailToken.purpose, purpose),
      isNull(emailToken.consumedAt),
      gt(emailToken.expiresAt, new Date()),
    )).limit(1);

  const row = rows[0];
  if (!row) return null;
  if ((row.owner.email ?? "").toLocaleLowerCase() !== row.token.email.toLocaleLowerCase()) return null;

  const claimed = await db.update(emailToken)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailToken.id, row.token.id), isNull(emailToken.consumedAt)))
    .returning({ id: emailToken.id });
  // 并发下只有一次更新能命中，另一次拿到空数组
  if (!claimed[0]) return null;
  return row;
}

export async function sendVerification(accountId: number): Promise<{ ok: true } | ApiFailure> {
  if (!mailEnabled()) return fail("mailDisabled");
  const rows = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  const owner = rows[0];
  if (!owner?.email) return fail("emailMissing");
  if (owner.emailVerified) return fail("emailVerified");

  const token = await issueToken(accountId, "verify", owner.email);
  if (!token) return fail("mailThrottled");

  const link = `${appOrigin()}/api/auth/email/verify?token=${encodeURIComponent(token)}`;
  await sendMail({ to: owner.email, subject: mailSubjects.verify, html: verifyEmailTemplate(link, TTL_MINUTES) });
  return { ok: true };
}

export async function verifyEmail(token: string): Promise<{ ok: true } | ApiFailure> {
  const row = await consumeToken(token, "verify");
  if (!row) return fail("linkExpiredVerify");
  await db.update(account).set({ emailVerified: true, updatedAt: new Date() }).where(eq(account.id, row.owner.id));
  await db.update(authIdentity).set({ emailVerified: true })
    .where(and(eq(authIdentity.accountId, row.owner.id), eq(authIdentity.provider, "password")));
  return { ok: true };
}

/** 申请重置。**无论邮箱是否存在都返回成功**，否则这个接口就成了账户枚举器。 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  if (!mailEnabled()) return;
  const email = rawEmail.trim().toLocaleLowerCase();
  const rows = await db.select().from(account).where(sql`lower(${account.email}) = ${email}`).limit(1);
  const owner = rows[0];
  if (!owner?.email || !owner.emailVerified) return;

  const token = await issueToken(owner.id, "reset", owner.email);
  if (!token) return;

  const link = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({ to: owner.email, subject: mailSubjects.reset, html: resetPasswordTemplate(link, TTL_MINUTES) });
}

export async function resetPassword(token: string, nextPassword: string): Promise<{ ok: true } | ApiFailure> {
  if (nextPassword.length < 8) return fail("newPasswordTooShort");
  const row = await consumeToken(token, "reset");
  if (!row) return fail("linkExpiredReset");

  const secret = await hashPassword(nextPassword);
  const email = row.owner.email!.toLocaleLowerCase();
  const existing = await db.select({ id: authIdentity.id }).from(authIdentity)
    .where(and(eq(authIdentity.accountId, row.owner.id), eq(authIdentity.provider, "password"))).limit(1);

  if (existing[0]) await db.update(authIdentity).set({ secret }).where(eq(authIdentity.id, existing[0].id));
  else await db.insert(authIdentity).values({ accountId: row.owner.id, provider: "password", subject: email, secret, email, emailVerified: true });

  await notifyPasswordChanged(row.owner.id);
  return { ok: true };
}

export async function notifyPasswordChanged(accountId: number) {
  const rows = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  const owner = rows[0];
  if (!owner?.email || !owner.emailVerified) return;
  const at = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  await sendMail({ to: owner.email, subject: mailSubjects.passwordChanged, html: passwordChangedTemplate(at) });
}
