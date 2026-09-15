import { entityId } from "../../../../shared/src/entity-id";
/** commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { requiredEntityId } from "../../../../shared/src/entity-id";
import { and, eq, isNull, sql } from "drizzle-orm";
import { campaign, map } from "../../db/schema/index";
import { diffLines, writeAudit } from "../admin/audit";
import { Admin, Result, failure, done } from "../admin/common";

export async function saveGoldenRoomRule(admin: Admin, input: Record<string, unknown>): Promise<Result> {
  const { goldenRoomRule } = await import("../../db/schema/index");
  const { readMapRooms } = await import("../tracker/golden-room-alerts");
  const id = entityId(input.id);
  return commandTransaction(async tx => {
    const old = id ? (await tx.select().from(goldenRoomRule).where(eq(goldenRoomRule.id, id)).for("update"))[0] : null;
    if (id && !old) return failure("规则不存在。", 404);
    if (input.remove === true) {
      if (!old) return failure("请选择要删除的规则。");
      const target = (await tx.select({ name: map.name }).from(map).where(eq(map.id, old.mapId)))[0];
      await tx.delete(goldenRoomRule).where(eq(goldenRoomRule.id, old.id));
      await writeAudit(tx, admin, "删除带金房间提醒", `${target?.name ?? old.mapId} · ${old.roomName} (${old.roomKey})`);
      return done(undefined);
    }
    const mapId = requiredEntityId(input.mapId);
    const sid = typeof input.sid === "string" ? input.sid : "";
    const side = typeof input.side === "string" ? input.side : "";
    const roomKey = typeof input.roomKey === "string" ? input.roomKey : "";
    if (typeof input.enabled !== "boolean" || typeof input.extraText !== "string" || input.extraText.length > 800) return failure("请设置启用状态，追加文本不能超过 800 字符。");
    const target = (await tx.select({ name: map.name }).from(map).innerJoin(campaign, eq(campaign.id,map.campaignId))
      .where(and(eq(map.id,mapId),isNull(map.deletedAt),isNull(campaign.deletedAt))).for("update"))[0];
    if (!target) return failure("地图不存在或已回收。",404);
    const rooms = await readMapRooms({ query: async (text, values = []) => {
      // 将数据层的编号参数转换成 Drizzle 绑定值，不拼接用户文本。
      const query = sql.join(text.split(/(\$\d+)/).map(part => /^\$\d+$/.test(part) ? sql`${values[Number(part.slice(1))-1]}` : sql.raw(part)), sql``);
      return await tx.execute(query);
    } }, mapId);
    const room = rooms.find(r => r.sid === sid && r.side === side && r.roomKey === roomKey);
    const sameTarget = old?.mapId === mapId && old.sid === sid && old.side === side && old.roomKey === roomKey;
    if (!room && !(sameTarget && input.enabled === false)) return failure("请选择当前有效的 Mod 上传路线房间；没有路线时只能停用原规则。");
    const duplicate = (await tx.select({ id: goldenRoomRule.id }).from(goldenRoomRule).where(and(eq(goldenRoomRule.mapId,mapId),eq(goldenRoomRule.sid,sid),eq(goldenRoomRule.side,side),eq(goldenRoomRule.roomKey,roomKey))))[0];
    if (duplicate && duplicate.id !== id) return failure("此地图房间已配置提醒，请编辑原规则。",409);
    const value = { mapId,sid,side,roomKey,roomName:room?.roomName ?? old!.roomName,extraText:input.extraText.trim(),enabled:input.enabled,updatedAt:new Date() };
    if (old) {
      await tx.execute(sql`DELETE FROM golden_room_event WHERE rule_id=${id} AND status='pending'`);
      if (!sameTarget) await tx.execute(sql`DELETE FROM golden_room_state WHERE rule_id=${id}`);
    }
    if (old) await tx.update(goldenRoomRule).set(value).where(eq(goldenRoomRule.id,old.id));
    else await tx.insert(goldenRoomRule).values(value);
    await writeAudit(tx,admin,old ? "修改带金房间提醒" : "新增带金房间提醒",
      `${target.name} · ${value.roomName} (${roomKey})\n${diffLines([["启用",old?.enabled,value.enabled],["目标",old ? `${old.sid}/${old.side}/${old.roomKey}` : null,`${sid}/${side}/${roomKey}`],["追加文本",old?.extraText,value.extraText]]).join("\n")}`);
    return done(undefined);
  });
}
