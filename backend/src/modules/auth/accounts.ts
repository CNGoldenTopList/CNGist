/** 账户读写。路由只做参数解析与状态码，业务规则集中在这里。 */
import { isAdminRole, type AccountRole } from "../../../../shared/src/account-roles";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, authIdentity, type Account } from "../../db/schema/index";
import { hashPassword, verifyPassword } from "./password";
import type { AccountPreferences } from "../../../../shared/src/account-preferences";
import { fail, type ApiFailure } from "../../../../shared/src/api-errors";

/** 发给客户端的账户投影。口令派生值绝不出现在这里。 */
export type SessionAccountPayload = {
  id: number;
  displayName: string;
  email: string;
  emailVerified: boolean;
  claimedPlayerId?: number;
  claimedBilibiliName?: string;
  bilibiliUid?: string;
  qqLinked: boolean;
  role: AccountRole;
  preferences: AccountPreferences;
};

export type Result<T> = { ok: true; data: T } | ApiFailure;

export function toSessionAccount(row: Account): SessionAccountPayload {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email ?? "",
    emailVerified: row.emailVerified,
    claimedPlayerId: row.claimedPlayerId ?? undefined,
    claimedBilibiliName: row.claimedBilibiliName ?? undefined,
    bilibiliUid: row.bilibiliUid ?? undefined,
    qqLinked: row.qqLinked,
    role: isAdminRole(row.role) ? row.role : "player",
    preferences: row.preferences ?? {},
  };
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const UNIQUE_VIOLATION = "23505";

/** drizzle 会把 pg 的原始错误包进自己的 Error，真正的 code 在 cause 链上。 */
function isUniqueViolation(error: unknown, constraint?: string) {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const detail = current as { code?: string; constraint?: string };
    if (detail.code !== UNIQUE_VIOLATION) continue;
    return constraint ? String(detail.constraint ?? "").includes(constraint) : true;
  }
  return false;
}

export async function getAccount(accountId: number) {
  const rows = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  return rows[0] ?? null;
}

export async function registerWithPassword(input: { email: string; password: string; displayName: string }): Promise<Result<Account>> {
  const email = input.email.trim().toLocaleLowerCase();
  if (!EMAIL_RE.test(email)) return fail("emailInvalid");
  if (input.password.length < 8) return fail("passwordTooShort");

  const secret = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const created = await tx.insert(account).values({
        displayName: input.displayName.trim() || email.split("@")[0],
        email,
        // 自助注册的邮箱未经验证，不能据此与 OIDC 身份自动合并
        emailVerified: false,
      }).returning();
      await tx.insert(authIdentity).values({
        accountId: created[0].id, provider: "password", subject: email, secret, email, lastLoginAt: new Date(),
      });
      return { ok: true as const, data: created[0] };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("emailRegistered");
    throw error;
  }
}

export async function loginWithPassword(input: { email: string; password: string }): Promise<Result<Account>> {
  const email = input.email.trim().toLocaleLowerCase();
  const rows = await db
    .select({ secret: authIdentity.secret, identityId: authIdentity.id, owner: account })
    .from(authIdentity)
    .innerJoin(account, eq(account.id, authIdentity.accountId))
    .where(and(eq(authIdentity.provider, "password"), eq(authIdentity.subject, email)))
    .limit(1);

  const row = rows[0];
  // 账户不存在与口令错误返回同一句话，避免邮箱枚举。
  if (!row || !(await verifyPassword(input.password, row.secret))) {
    return fail("badCredentials");
  }
  if (row.owner.status !== "active") return fail("accountDisabled");

  await db.update(authIdentity).set({ lastLoginAt: new Date() }).where(eq(authIdentity.id, row.identityId));
  return { ok: true, data: row.owner };
}

export async function updateProfile(accountId: number, patch: { displayName?: string; email?: string }): Promise<Result<Account>> {
  const next: Partial<typeof account.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) {
    const value = patch.displayName.trim();
    if (!value) return fail("displayNameRequired");
    next.displayName = value;
  }
  if (patch.email !== undefined) {
    const value = patch.email.trim().toLocaleLowerCase();
    if (!EMAIL_RE.test(value)) return fail("emailInvalid");
    next.email = value;
    // 改过的邮箱要重新验证，否则改邮箱就能绕开合并规则
    next.emailVerified = false;
  }
  try {
    const rows = await db.update(account).set(next).where(eq(account.id, accountId)).returning();
    return rows[0] ? { ok: true, data: rows[0] } : fail("accountMissing");
  } catch (error) {
    if (isUniqueViolation(error, "account_email_lower_key")) return fail("emailTaken");
    throw error;
  }
}

export async function mergePreferences(accountId: number, patch: AccountPreferences): Promise<Result<Account>> {
  const rows = await db.update(account)
    .set({ preferences: sql`${account.preferences} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
    .where(eq(account.id, accountId)).returning();
  return rows[0] ? { ok: true, data: rows[0] } : fail("accountMissing");
}

/** 改密。OIDC 注册的账户还没有口令身份，此时允许直接设置一个—— */
export async function setPassword(accountId: number, input: { currentPassword: string; nextPassword: string }): Promise<Result<null>> {
  if (input.nextPassword.length < 8) return fail("newPasswordTooShort");

  const existing = await db.select().from(authIdentity)
    .where(and(eq(authIdentity.accountId, accountId), eq(authIdentity.provider, "password"))).limit(1);
  const secret = await hashPassword(input.nextPassword);

  if (existing[0]) {
    if (!(await verifyPassword(input.currentPassword, existing[0].secret))) return fail("passwordWrong");
    await db.update(authIdentity).set({ secret }).where(eq(authIdentity.id, existing[0].id));
    return { ok: true, data: null };
  }

  const owner = await getAccount(accountId);
  if (!owner?.email) return fail("emailBeforePassword");
  try {
    await db.insert(authIdentity).values({
      accountId, provider: "password", subject: owner.email.toLocaleLowerCase(), secret, email: owner.email,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("emailUsedByOther");
    throw error;
  }
  return { ok: true, data: null };
}
