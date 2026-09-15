/** 服务端会话。Cookie 里是原始令牌，库里只存它的 SHA-256。 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "../../plugins/http";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db/client";
import { account, session } from "../../db/schema/index";
import { appOrigin } from "./providers";

export const SESSION_COOKIE = "cngist_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 不看请求头判断 https：反代不一定转发 X-Forwarded-Proto，以 server.origin 为准。 */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(accountId: number, amr: string[], meta: { userAgent?: string; ip?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(session).values({
    accountId,
    tokenHash: hashToken(token),
    amr,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 500),
    ip: meta.ip,
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
  return { token, expiresAt };
}

export type CurrentSession = { accountId: number; sessionId: number; amr: string[] };

export async function currentSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: session.id, accountId: session.accountId, amr: session.amr })
    .from(session)
    .innerJoin(account, eq(account.id, session.accountId))
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, new Date()), eq(account.status, "active")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { accountId: row.accountId, sessionId: row.id, amr: row.amr };
}

export async function currentAccount() {
  const active = await currentSession();
  if (!active) return null;
  const rows = await db.select().from(account).where(eq(account.id, active.accountId)).limit(1);
  return rows[0] ?? null;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(session).where(eq(session.tokenHash, hashToken(token)));
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
}
