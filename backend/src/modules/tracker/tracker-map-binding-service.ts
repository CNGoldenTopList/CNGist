import { entityId } from "../../../../shared/src/entity-id";
/** SID/面 与目录地图的配对：玩家指认、管理员审核、全站生效。 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, pool } from "../../db/client";
import { account, campaign, map, trackerMapBinding } from "../../db/schema/index";
import { readUnboundScopes } from "./unbound-scopes";
import { writeAudit } from "../admin/audit";
import type { Admin } from "../admin/admin-commands";
import { fail, type ApiErrorCode, type ApiFailure } from "../../../../shared/src/api-errors";

export type Side = "Normal" | "BSide" | "CSide";
const SIDES: Side[] = ["Normal", "BSide", "CSide"];
export type Result<T> = { ok: true; data: T } | (ApiFailure & { status: number });
function failCode(code: ApiErrorCode, status = 400): Result<never> { return { ...fail(code), status }; }
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function isSide(value: unknown): value is Side { return SIDES.includes(value as Side); }

export type MapBinding = { sid: string; side: Side; mapId: number };

/** 生效中的映射。软删的地图不返回：目录里已经没有的地图不能继续对外配对。 */
export async function resolveMapBindings(keys?: { sid: string; side: Side }[]): Promise<MapBinding[]> {
  if (keys && keys.length === 0) return [];
  // 只按 SID 收窄到数据库，(SID, 面) 这一对在内存里配：行构造子的 IN 各驱动渲染不一，
  // 而这条是所有展示的入口，宁可多读几行也不押在一个没被测到的 SQL 形态上。
  const wanted = keys && new Set(keys.map((key) => `${key.sid} ${key.side}`));
  const rows = await db.select({ sid: trackerMapBinding.sid, side: trackerMapBinding.side, mapId: trackerMapBinding.mapId })
    .from(trackerMapBinding)
    .innerJoin(map, eq(map.id, trackerMapBinding.mapId))
    .where(and(
      eq(trackerMapBinding.status, "approved"),
      isNull(map.deletedAt),
      keys ? inArray(trackerMapBinding.sid, [...new Set(keys.map((key) => key.sid))]) : undefined,
    ));
  return rows.filter((row): row is MapBinding =>
    isSide(row.side) && (!wanted || wanted.has(`${row.sid} ${row.side}`)));
}

/** 最近进入的未配对 SID/面，最多 10 项。 */
export async function listUnboundScopes(accountId: number) {
  return readUnboundScopes(pool, accountId);
}

/** 玩家指认：必须自己上传过这个 SID/面的数据，目标必须是一张未删除的地图。 */
export async function proposeMapBinding(
  accountId: number,
  input: { sid?: unknown; side?: unknown; mapId?: unknown },
): Promise<Result<{ id: number }>> {
  const sid = clean(input.sid, 512);
  const mapId = entityId(input.mapId);
  if (!sid || !isSide(input.side)) return failCode("trackerScopeInvalid");
  const side = input.side;
  if (!mapId) return failCode("trackerMapRequired");

  // 校验特定作用域，不受首页 10 项展示上限影响。
  const owned = await readUnboundScopes(pool, accountId, { sid, side });
  if (!owned.some((item) => item.sid === sid && item.side === side)) return failCode("trackerScopeNotUploaded", 403);

  const targets = await db.select({ id: map.id }).from(map)
    .where(and(eq(map.id, mapId), isNull(map.deletedAt))).limit(1);
  if (!targets[0]) return failCode("mapMissing", 404);

  return db.transaction(async (tx) => {
    // 等待审核期间别人可能已经把同一个 SID/面配好了，这时不必再提一份。
    const live = await tx.select({ id: trackerMapBinding.id }).from(trackerMapBinding)
      .where(and(eq(trackerMapBinding.sid, sid), eq(trackerMapBinding.side, side), eq(trackerMapBinding.status, "approved"))).limit(1);
    if (live[0]) return failCode("trackerBindingExists", 409);
    const previous = await tx.select({ id: trackerMapBinding.id }).from(trackerMapBinding)
      .where(and(
        eq(trackerMapBinding.accountId, accountId), eq(trackerMapBinding.sid, sid),
        eq(trackerMapBinding.side, side), eq(trackerMapBinding.status, "pending"),
      )).limit(1);
    if (previous[0]) {
      // 改主意时替换自己那条待审，不排第二个队。
      await tx.update(trackerMapBinding).set({ mapId, createdAt: new Date() }).where(eq(trackerMapBinding.id, previous[0].id));
      return { ok: true as const, data: { id: previous[0].id } };
    }
    const inserted = await tx.insert(trackerMapBinding)
      .values({ accountId, sid, side, mapId }).returning({ id: trackerMapBinding.id });
    return { ok: true as const, data: { id: inserted[0]!.id } };
  });
}

export type BindingReview = {
  id: number; sid: string; side: string; mapId: number;
  mapName: string; campaignName: string; proposedBy: string;
  createdAt: string; reviewedAt: string | null;
};

async function listByStatus(status: "pending" | "approved"): Promise<BindingReview[]> {
  const rows = await db.select({
    id: trackerMapBinding.id, sid: trackerMapBinding.sid, side: trackerMapBinding.side,
    mapId: trackerMapBinding.mapId, mapName: map.name, campaignName: campaign.name,
    proposedBy: account.displayName, createdAt: trackerMapBinding.createdAt, reviewedAt: trackerMapBinding.reviewedAt,
  }).from(trackerMapBinding)
    .leftJoin(map, eq(map.id, trackerMapBinding.mapId))
    .leftJoin(campaign, eq(campaign.id, map.campaignId))
    .leftJoin(account, eq(account.id, trackerMapBinding.accountId))
    .where(eq(trackerMapBinding.status, status))
    .orderBy(status === "pending" ? asc(trackerMapBinding.createdAt) : desc(trackerMapBinding.reviewedAt));
  return rows.map((row) => ({
    id: row.id, sid: row.sid, side: row.side, mapId: row.mapId,
    mapName: row.mapName ?? String(row.mapId), campaignName: row.campaignName ?? "",
    proposedBy: row.proposedBy ?? "", createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
}

export const listPendingMapBindings = () => listByStatus("pending");
export const listApprovedMapBindings = () => listByStatus("approved");

type AdminResult<T = void> = { ok: true; data: T } | { ok: false; error: string; status: number };
const adminFail = (error: string, status = 400): AdminResult<never> => ({ ok: false, error, status });
const adminDone: AdminResult = { ok: true, data: undefined };

/** 通过即全站生效。同一 SID/面已有生效配对时不覆盖，必须先撤销旧的。 */
export async function reviewMapBinding(
  admin: Admin,
  id: number,
  input: { status?: unknown; note?: unknown },
): Promise<AdminResult> {
  const status = clean(input.status, 32);
  if (!["approved", "rejected"].includes(status)) return adminFail("审核结论无效。");
  const note = clean(input.note, 2_000) || null;
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(trackerMapBinding).where(eq(trackerMapBinding.id, id)).for("update");
    const request = rows[0];
    if (!request) return adminFail("配对申请不存在。", 404);
    if (request.status !== "pending") return adminFail("该申请已处理。", 409);
    const label = `${request.sid} / ${request.side}`;

    if (status === "rejected") {
      await tx.update(trackerMapBinding)
        .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: note })
        .where(eq(trackerMapBinding.id, id));
      await writeAudit(tx, admin, "驳回地图配对", `${label}${note ? `：${note}` : ""}`);
      return adminDone;
    }

    const live = await tx.select({ id: trackerMapBinding.id }).from(trackerMapBinding)
      .where(and(eq(trackerMapBinding.sid, request.sid), eq(trackerMapBinding.side, request.side), eq(trackerMapBinding.status, "approved"))).limit(1);
    if (live[0]) return adminFail("该 SID 与面已有生效配对，请先撤销。", 409);
    const target = await tx.select({ name: map.name }).from(map)
      .where(and(eq(map.id, request.mapId), isNull(map.deletedAt))).limit(1);
    if (!target[0]) return adminFail("目标地图不存在或已删除。", 409);

    await tx.update(trackerMapBinding)
      .set({ status: "approved", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: note })
      .where(eq(trackerMapBinding.id, id));
    await writeAudit(tx, admin, "通过地图配对", `${label} 配到 ${target[0].name}`);
    return adminDone;
  });
}

/** 撤销已生效的配对。审核出错时唯一的出口，否则那条映射对全站永久生效。 */
export async function revokeMapBinding(admin: Admin, id: number, note?: unknown): Promise<AdminResult> {
  const reason = clean(note, 2_000) || null;
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(trackerMapBinding).where(eq(trackerMapBinding.id, id)).for("update");
    const binding = rows[0];
    if (!binding) return adminFail("配对不存在。", 404);
    if (binding.status !== "approved") return adminFail("该配对未生效。", 409);
    await tx.update(trackerMapBinding)
      .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: reason })
      .where(eq(trackerMapBinding.id, id));
    await writeAudit(tx, admin, "撤销地图配对", `${binding.sid} / ${binding.side}${reason ? `：${reason}` : ""}`);
    return adminDone;
  });
}
