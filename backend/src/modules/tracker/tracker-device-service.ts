/** 设备授权与设备凭证。 */
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../../db/client";
import { account, trackerCctStorage, trackerDevice, trackerDeviceAuthorization } from "../../db/schema/index";
import { AUTH_CODE_TTL_MS, buildRedirect, hashSecret, newSecret, verifyCodeVerifier } from "./device-auth";
import type { AuthorizeRequest } from "./device-auth";

export type { AuthorizeRequest };
export { parseAuthorizeRequest } from "./device-auth";
import { fail, type ApiErrorCode, type ApiFailure } from "../../../../shared/src/api-errors";

export type Result<T> = { ok: true; data: T } | (ApiFailure & { status: number });
function failCode(code: ApiErrorCode, status = 400): Result<never> { return { ...fail(code), status }; }

/** 玩家点了确认。签发一次性授权码。 */
export async function approveAuthorization(accountId: number, request: AuthorizeRequest) {
  const code = newSecret();
  await db.transaction(async (tx) => {
    await tx.insert(trackerCctStorage).values({ accountId, enabled: true }).onConflictDoUpdate({
      target: trackerCctStorage.accountId,
      set: { enabled: true, updatedAt: new Date() },
    });
    await tx.insert(trackerDeviceAuthorization).values({
      accountId,
      codeHash: hashSecret(code),
      codeChallenge: request.codeChallenge,
      redirectUri: request.redirectUri,
      deviceName: request.deviceName,
      clientName: request.clientName,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });
  });
  return {
    code,
    redirectTo: request.redirectUri ? buildRedirect(request.redirectUri, code, request.state) : null,
  };
}

export type DeviceCredential = { deviceId: string; accessToken: string; deviceName: string };

/** 用授权码兑换设备凭证。一次性、限时、必须带对 codeVerifier。 */
export async function redeemAuthorization(input: { code?: unknown; codeVerifier?: unknown }): Promise<Result<DeviceCredential>> {
  const code = typeof input.code === "string" ? input.code : "";
  if (!code || code.length > 256) return failCode("deviceCodeInvalid");

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(trackerDeviceAuthorization)
      .where(eq(trackerDeviceAuthorization.codeHash, hashSecret(code))).for("update");
    const grant = rows[0];
    if (!grant) return failCode("deviceCodeInvalid");
    // 已兑换过的码不再签发第二份凭证：成功响应丢了就重新走一次授权。
    if (grant.consumedAt) return failCode("deviceCodeUsed", 409);
    if (grant.expiresAt.getTime() <= Date.now()) return failCode("deviceCodeExpired", 410);
    if (!verifyCodeVerifier(input.codeVerifier, grant.codeChallenge)) return failCode("deviceVerifierMismatch", 403);

    const accessToken = newSecret();
    const device = await tx.insert(trackerDevice).values({
      accountId: grant.accountId,
      name: grant.deviceName,
      clientName: grant.clientName,
      tokenHash: hashSecret(accessToken),
    }).returning({ externalId: trackerDevice.externalId });
    await tx.update(trackerDeviceAuthorization)
      .set({ consumedAt: new Date() }).where(eq(trackerDeviceAuthorization.id, grant.id));
    return { ok: true as const, data: { deviceId: device[0]!.externalId, accessToken, deviceName: grant.deviceName } };
  });
}

export type DevicePrincipal = { accountId: number; deviceId: number; externalId: string; historyEpoch: string };

/** 上传通道唯一的身份来源：token 反查账户与设备。 */
export async function authenticateDevice(token: string | null): Promise<DevicePrincipal | null> {
  if (!token) return null;
  const rows = await db.select({
    deviceId: trackerDevice.id, externalId: trackerDevice.externalId, accountId: trackerDevice.accountId,
    revokedAt: trackerDevice.revokedAt, accountStatus: account.status,
    enabled: trackerCctStorage.enabled, historyEpoch: trackerCctStorage.historyEpoch,
  }).from(trackerDevice)
    .innerJoin(account, eq(account.id, trackerDevice.accountId))
    .leftJoin(trackerCctStorage, eq(trackerCctStorage.accountId, trackerDevice.accountId))
    .where(eq(trackerDevice.tokenHash, hashSecret(token))).limit(1);
  const device = rows[0];
  if (!device || device.accountStatus !== "active" || device.revokedAt || !device.enabled || !device.historyEpoch) return null;
  return { accountId: device.accountId, deviceId: device.deviceId, externalId: device.externalId, historyEpoch: device.historyEpoch };
}

/** 心跳式记录，失败不影响主流程。 */
export async function touchDevice(deviceId: number) {
  await db.update(trackerDevice).set({ lastSeenAt: new Date() }).where(eq(trackerDevice.id, deviceId));
}

export type DeviceRow = {
  id: number; name: string; clientName: string;
  createdAt: string; lastSeenAt: string | null; revokedAt: string | null;
};

/** 本人设备列表。不返回摘要，更不返回 token。 */
export async function listDevices(accountId: number): Promise<DeviceRow[]> {
  const rows = await db.select({
    id: trackerDevice.id, name: trackerDevice.name, clientName: trackerDevice.clientName,
    createdAt: trackerDevice.createdAt, lastSeenAt: trackerDevice.lastSeenAt, revokedAt: trackerDevice.revokedAt,
  }).from(trackerDevice)
    .where(eq(trackerDevice.accountId, accountId))
    .orderBy(asc(trackerDevice.createdAt));
  return rows.map((row) => ({
    id: row.id, name: row.name, clientName: row.clientName,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

/** 撤销自己的设备。幂等：已撤销的再撤一次仍然成功。 */
export async function revokeDevice(accountId: number, deviceId: number): Promise<Result<{ id: number }>> {
  const rows = await db.update(trackerDevice)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(trackerDevice.id, deviceId),
      eq(trackerDevice.accountId, accountId),
      isNull(trackerDevice.revokedAt),
    )).returning({ externalId: trackerDevice.externalId });
  if (rows[0]) return { ok: true, data: { id: deviceId } };
  const existing = await db.select({ id: trackerDevice.id }).from(trackerDevice)
    .where(and(eq(trackerDevice.id, deviceId), eq(trackerDevice.accountId, accountId))).limit(1);
  if (!existing[0]) return failCode("deviceMissing", 404);
  return { ok: true, data: { id: deviceId } };
}

/** 过期或已兑换的授权行没有保留价值，顺手清掉，别让表无限长。 */
export async function pruneAuthorizations() {
  const cutoff = new Date(Date.now() - AUTH_CODE_TTL_MS);
  await db.delete(trackerDeviceAuthorization).where(or(
    lt(trackerDeviceAuthorization.expiresAt, cutoff),
    lt(trackerDeviceAuthorization.createdAt, cutoff),
  ));
}
