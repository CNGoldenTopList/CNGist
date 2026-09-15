/** 把一次 provider 登录落到具体账户上。 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { account, authIdentity } from "../../db/schema/index";
import type { AuthProviderId } from "./providers";

export type IdentityInput = {
  provider: AuthProviderId;
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
};

export type LinkOutcome = { accountId: number; created: boolean; linked: boolean };

export async function resolveAccountForIdentity(input: IdentityInput, currentAccountId?: number): Promise<LinkOutcome> {
  const email = input.email?.trim().toLowerCase() || undefined;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: authIdentity.id, accountId: authIdentity.accountId })
      .from(authIdentity)
      .where(and(eq(authIdentity.provider, input.provider), eq(authIdentity.subject, input.subject)))
      .limit(1);

    // 1. 这个身份已经绑过了。若当前已登录且是另一个账户，说明这个身份属于别人，拒绝。
    if (existing[0]) {
      if (currentAccountId && currentAccountId !== existing[0].accountId) {
        throw new Error("该身份已绑定到另一个账户");
      }
      await tx.update(authIdentity).set({ lastLoginAt: new Date(), email, emailVerified: input.emailVerified })
        .where(eq(authIdentity.id, existing[0].id));
      return { accountId: existing[0].accountId, created: false, linked: false };
    }

    // 2. 已登录状态下发起的绑定：挂到当前账户。
    if (currentAccountId) {
      await tx.insert(authIdentity).values({
        accountId: currentAccountId, provider: input.provider, subject: input.subject,
        email, emailVerified: input.emailVerified, lastLoginAt: new Date(),
      });
      return { accountId: currentAccountId, created: false, linked: true };
    }

    // 3. 未登录。邮箱已验证时才允许认领同邮箱的既有账户。
    if (email && input.emailVerified) {
      const owner = await tx.select({ id: account.id }).from(account)
        .where(sql`lower(${account.email}) = ${email}`).limit(1);
      if (owner[0]) {
        await tx.insert(authIdentity).values({
          accountId: owner[0].id, provider: input.provider, subject: input.subject,
          email, emailVerified: true, lastLoginAt: new Date(),
        });
        return { accountId: owner[0].id, created: false, linked: true };
      }
    }

    // 4. 全新账户。邮箱未验证时不写进 account.email，避免它日后被当成合并依据。
    const created = await tx.insert(account).values({
      displayName: input.displayName?.trim() || `用户${input.subject.slice(-6)}`,
      email: input.emailVerified ? email : null,
      emailVerified: input.emailVerified,
    }).returning({ id: account.id });

    await tx.insert(authIdentity).values({
      accountId: created[0].id, provider: input.provider, subject: input.subject,
      email, emailVerified: input.emailVerified, lastLoginAt: new Date(),
    });
    return { accountId: created[0].id, created: true, linked: true };
  });
}

/** 账户页用：列出已绑定的登录方式，并算出能不能解绑（至少留一种）。 */
export async function boundIdentities(accountId: number) {
  const rows = await db.select({
    provider: authIdentity.provider,
    email: authIdentity.email,
    linkedAt: authIdentity.linkedAt,
    lastLoginAt: authIdentity.lastLoginAt,
  }).from(authIdentity).where(eq(authIdentity.accountId, accountId));
  return rows.map((row) => ({ ...row, canUnbind: rows.length > 1 }));
}
