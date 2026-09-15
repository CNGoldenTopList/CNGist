/** commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { nextEntityId } from "../../db/ids";
import { playerBilibiliUids, parseBilibiliUids } from "../../../../shared/src/bilibili-uid";
import { lockPlayerNames, playerNameTaken, playerHasBilibiliUid } from "./player-names";
import { and, eq, isNull, ne } from "drizzle-orm";
import { account, map, player, playerClaimRequest } from "../../db/schema/index";
import { fetchBilibiliName } from "../../integrations/bilibili";
import { diffLines, writeAudit, type Tx } from "../admin/audit";
import { Admin, Result, failure, clean, done, optional } from "../admin/common";

export async function updatePlayer(admin: Admin, id: number, patch: { displayName?: unknown; status?: unknown; bilibiliUids?: unknown }): Promise<Result> {
  const bindings = patch.bilibiliUids === undefined ? undefined : parseBilibiliUids(patch.bilibiliUids);
  if (bindings === null) return failure("B 站 UID 无效，请填数字 UID 或主页链接，多个用逗号或换行分隔（最多 50 个）。");
  const displayName = clean(patch.displayName, 300);
  const status = clean(patch.status, 32);
  if (!displayName) return failure("玩家显示名不能为空。");
  if (!["unasked", "normal", "unreplied", "unwilling", "blocked"].includes(status)) return failure("玩家状态无效。");
  return commandTransaction(async (tx) => {
    await lockPlayerNames(tx);
    const rows = await tx.select().from(player).where(and(eq(player.id, id), isNull(player.deletedAt))).limit(1);
    const before = rows[0];
    if (!before) return failure("玩家不存在。", 404);
    if (displayName !== before.name && await playerNameTaken(tx, displayName, id)) return failure("已有同名玩家或待审申请，请使用其他显示名。", 409);
    if (bindings) {
      for (const uid of bindings) {
        const [existing] = await tx.select({ name: player.name }).from(player).where(and(ne(player.id, id), playerHasBilibiliUid(uid))).limit(1);
        if (existing) return failure(`UID ${uid} 已经建档为「${existing.name}」。`, 409);
      }
    }
    await tx.update(player).set({ name: displayName, status, ...(bindings ? {
      bilibiliUids: bindings, bilibiliUid: bindings[0] ?? null,
      bilibiliUrl: bindings[0] ? `https://space.bilibili.com/${bindings[0]}` : null,
    } : {}) }).where(eq(player.id, id));
    const lines = diffLines([["显示名", before.name, displayName], ["状态", before.status, status], ["B 站 UID", playerBilibiliUids(before).join("、"), (bindings ?? playerBilibiliUids(before)).join("、")]]);
    await writeAudit(tx, admin, "修改玩家资料", `修改玩家 ${before.name}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export async function detachPlayer(tx: Tx, id: number) {
  return tx.update(account).set({
    claimedPlayerId: null, claimedBilibiliName: null, bilibiliUid: null, updatedAt: new Date(),
  }).where(eq(account.claimedPlayerId, id)).returning({ id: account.id, displayName: account.displayName });
}

export async function unlinkPlayer(admin: Admin, id: number): Promise<Result> {
  return commandTransaction(async (tx) => {
    await lockPlayerNames(tx);
    const [target] = await tx.select().from(player).where(and(eq(player.id, id), isNull(player.deletedAt))).for("update");
    if (!target) return failure("玩家不存在。", 404);
    const detached = await detachPlayer(tx, id);
    if (!detached.length) return failure("该玩家尚未被认领。", 409);
    await writeAudit(tx, admin, "解除玩家认领", `${target.name} · ${detached.map((row) => `${row.displayName}（${row.id}）`).join("、")}`);
    return done(undefined);
  });
}

export type PlayerCreateInput = { name?: unknown; bilibiliUid?: unknown; bilibiliUids?: unknown };

export async function createPlayer(admin: Admin, input: PlayerCreateInput): Promise<Result<{ id: number; name: string }>> {
  const typedName = clean(input.name, 300);
  const bilibiliUids = parseBilibiliUids(input.bilibiliUids ?? input.bilibiliUid ?? "");
  if (!bilibiliUids) return failure("B 站 UID 无效，请填数字 UID 或主页链接，多个用逗号或换行分隔（最多 50 个）。");
  const bilibiliUid = bilibiliUids[0] ?? null;
  if (!bilibiliUid && !typedName) return failure("请填写 B 站 UID，或者至少给一个显示名。");

  let name = typedName;
  if (bilibiliUid) {
    const lookup = await fetchBilibiliName(bilibiliUid);
    if (lookup.ok) name = lookup.name;
    else if (!typedName) return failure(`${lookup.error}也可以先手填一个显示名再建档。`);
  }
  if (!name) return failure("请填写玩家显示名。");

  return commandTransaction(async (tx) => {
    await lockPlayerNames(tx);
    if (await playerNameTaken(tx, name)) return failure("已有同名玩家或待审申请，请使用其他显示名。", 409);
    for (const uid of bilibiliUids) {
      const existing = await tx.select({ id: player.id, name: player.name }).from(player).where(playerHasBilibiliUid(uid)).limit(1);
      if (existing[0]) return failure(`该 B 站 UID 已经建档为「${existing[0].name}」。`, 409);
    }
    const id = await nextEntityId("player", tx);
    await tx.insert(player).values({ id, name, bilibiliUids, bilibiliUid, bilibiliUrl: bilibiliUid ? `https://space.bilibili.com/${bilibiliUid}` : null });
    await writeAudit(tx, admin, "新建玩家档案",
      `${name}${bilibiliUid ? `（UID ${bilibiliUids.join("、")}${name === typedName ? "，昵称为管理员手填" : "，昵称取自 B 站"}）` : "（未绑定 B 站）"}`);
    return done({ id, name });
  });
}

export type ClaimReviewInput = { status?: unknown; note?: unknown };

export async function reviewPlayerClaimRequest(admin: Admin, id: number, input: ClaimReviewInput): Promise<Result<{ playerId?: number }>> {
  const status = clean(input.status, 32);
  if (!["approved", "rejected"].includes(status)) return failure("审核结论无效。");
  const note = optional(input.note, 2_000);
  return commandTransaction(async (tx) => {
    await lockPlayerNames(tx);
    const rows = await tx.select().from(playerClaimRequest).where(eq(playerClaimRequest.id, id)).for("update");
    const request = rows[0];
    if (!request) return failure("申请不存在。", 404);
    if (request.status !== "pending") return failure("该申请已处理。", 409);

    if (status === "rejected") {
      await tx.update(playerClaimRequest).set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: note }).where(eq(playerClaimRequest.id, id));
      await writeAudit(tx, admin, "驳回新身份申请", `${request.bilibiliName}（UID ${request.bilibiliUid}）${note ? `：${note}` : ""}`);
      return done({});
    }

    return failure("请让申请人生成绑定码，并在管理玩家中核对专栏评论后接受绑定码。", 409);
  });
}
