import { nextEntityId } from "../../db/ids";
import { entityId } from "../../../../shared/src/entity-id";
/** layout-commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { pathEntityId } from "../../../../shared/src/entity-id";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { campaign, campaignHall, campaignHallMap, campaignMenuItem, challenge, map } from "../../db/schema/index";
import { normalizedCampaignMenu } from "../../../../shared/src/campaign-menu";
import { diffLines, writeAudit } from "../admin/audit";
import { Admin, Result, stringArray, clean, failure, idArray, optional, done } from "../admin/common";

export type HallInput = { id?: unknown; name?: unknown; cnName?: unknown; aliases?: unknown; color?: unknown; mapIds?: unknown };

export async function saveCampaignLayout(admin: Admin, campaignId: number, input: { halls?: HallInput[]; rootTokens?: unknown }): Promise<Result> {
  const rootTokens = stringArray(input.rootTokens, 5_000);
  const halls = (input.halls ?? []).filter((hall) => clean(hall.name, 300));
  return commandTransaction(async (tx) => {
    const locked = await tx.execute<{ id: number; name: string }>(sql`select id, name from campaign where id = ${campaignId} for update`);
    const owner = locked.rows[0];
    if (!owner) return failure("地图包不存在。", 404);

    const ownMaps = await tx.select({ id: map.id, name: map.name, sortOrder: map.sortOrder }).from(map)
      .where(and(eq(map.campaignId, campaignId), isNull(map.deletedAt)));
    const ownMapIds = new Set(ownMaps.map((row) => row.id));
    const mapNames = new Map(ownMaps.map((row) => [row.id, row.name]));

    const beforeHalls = await tx.select().from(campaignHall).where(eq(campaignHall.campaignId, campaignId)).orderBy(asc(campaignHall.sortOrder));
    const beforeMembers = beforeHalls.length
      ? await tx.select().from(campaignHallMap).where(inArray(campaignHallMap.hallId, beforeHalls.map((row) => row.id))).orderBy(asc(campaignHallMap.sortOrder))
      : [];

    // 一张地图最多归入一个大厅，重复出现的以先声明的大厅为准。
    const claimed = new Set<number>();
    const prepared = await Promise.all(halls.map(async (hall, index) => {
      const id = entityId(hall.id) || await nextEntityId("campaign_hall", tx);
      const mapIds: number[] = [];
      for (const mapId of idArray(hall.mapIds, 2_000)) {
        if (!ownMapIds.has(mapId) || claimed.has(mapId)) continue;
        claimed.add(mapId);
        mapIds.push(mapId);
      }
      const position = rootTokens.indexOf(`hall:${id}`);
      return {
        id, campaignId, name: clean(hall.name, 300), cnName: optional(hall.cnName, 300),
        aliases: stringArray(hall.aliases), color: clean(hall.color, 32) || "#67c9ff",
        sortOrder: position >= 0 ? position : rootTokens.length + index, mapIds,
      };
    }));
    if (new Set(prepared.map((hall) => hall.id)).size !== prepared.length) return failure("大厅编号重复。");

    await tx.delete(campaignHall).where(eq(campaignHall.campaignId, campaignId));
    for (const hall of prepared) {
      const { mapIds, ...row } = hall;
      await tx.insert(campaignHall).values(row);
      if (mapIds.length) await tx.insert(campaignHallMap).values(mapIds.map((mapId, sortOrder) => ({ hallId: hall.id, mapId, sortOrder })));
    }
    // 游离地图与大厅共享同一套根级序号，读路径据此还原展示顺序。
    for (const [index, token] of rootTokens.entries()) {
      if (!token.startsWith("map:")) continue;
      const mapId = pathEntityId(token.slice(4));
      if (!ownMapIds.has(mapId) || claimed.has(mapId)) continue;
      await tx.update(map).set({ sortOrder: index }).where(eq(map.id, mapId));
    }

    const beforeById = new Map(beforeHalls.map((row) => [row.id, row]));
    const afterById = new Map(prepared.map((row) => [row.id, row]));
    const membersBefore = new Map<number, number[]>();
    for (const row of beforeMembers) membersBefore.set(row.hallId, [...(membersBefore.get(row.hallId) ?? []), row.mapId]);
    const named = (ids: number[]) => ids.map((id) => mapNames.get(id) ?? id);
    const lines = [
      ...prepared.filter((hall) => !beforeById.has(hall.id)).map((hall) => `- 新增大厅：${hall.name}`),
      ...beforeHalls.filter((hall) => !afterById.has(hall.id)).map((hall) => `- 删除大厅：${hall.name}`),
      ...prepared.flatMap((hall) => {
        const before = beforeById.get(hall.id);
        if (!before) return [];
        return diffLines([
          [`大厅 ${before.name} 名称`, before.name, hall.name],
          [`大厅 ${hall.name} 汉化`, before.cnName, hall.cnName],
          [`大厅 ${hall.name} 汉化别名`, before.aliases, hall.aliases],
          [`大厅 ${hall.name} 竖线颜色`, before.color, hall.color],
          [`大厅 ${hall.name} 内含地图`, named(membersBefore.get(hall.id) ?? []), named(hall.mapIds)],
        ]);
      }),
    ];
    const beforeOrder = [
      ...beforeHalls.map((row) => ({ token: `hall:${row.id}`, order: row.sortOrder })),
      ...ownMaps.filter((row) => !beforeMembers.some((member) => member.mapId === row.id))
        .map((row) => ({ token: `map:${row.id}`, order: row.sortOrder ?? 1_000_000 })),
    ].sort((a, b) => a.order - b.order || a.token.localeCompare(b.token)).map((item) => item.token);
    const tokenName = (token: string) => token.startsWith("hall:")
      ? (afterById.get(pathEntityId(token.slice(5)))?.name ?? beforeById.get(pathEntityId(token.slice(5)))?.name ?? token)
      : (mapNames.get(pathEntityId(token.slice(4))) ?? token);
    lines.push(...diffLines([["根级顺序", beforeOrder.map(tokenName).join(" → "), rootTokens.map(tokenName).join(" → ")]]));
    await writeAudit(tx, admin, "调整地图包结构", `地图包 ${owner.name}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export async function saveCampaignMenu(admin: Admin, input: { fixed?: unknown; favorites?: unknown }): Promise<Result> {
  const menu = normalizedCampaignMenu(idArray(input.fixed, 50), idArray(input.favorites, 50));
  const ids = [...menu.fixed, ...menu.favorites];
  return commandTransaction(async (tx) => {
    const rows = await tx.select({ id: campaign.id, name: campaign.name }).from(campaign).where(inArray(campaign.id, ids));
    if (rows.length !== new Set(ids).size) return failure("菜单中存在不存在的地图包。");
    const names = new Map(rows.map((row) => [row.id, row.name]));
    const before = await tx.select().from(campaignMenuItem).orderBy(asc(campaignMenuItem.section), asc(campaignMenuItem.position));
    await tx.delete(campaignMenuItem);
    if (ids.length) await tx.insert(campaignMenuItem).values([
      ...menu.fixed.map((campaignId, position) => ({ section: "fixed", position, campaignId })),
      ...menu.favorites.map((campaignId, position) => ({ section: "default_favorite", position, campaignId })),
    ]);
    const label = (list: number[]) => list.map((id) => names.get(id) ?? id).join(" → ") || "空";
    const lines = diffLines([
      ["固定区", label(before.filter((row) => row.section === "fixed").map((row) => row.campaignId)), label(menu.fixed)],
      ["默认收藏区", label(before.filter((row) => row.section === "default_favorite").map((row) => row.campaignId)), label(menu.favorites)],
    ]);
    await writeAudit(tx, admin, "修改顶部地图包菜单", lines.join("\n") || "- 无实际变化");
    return done(undefined);
  });
}

export async function reorderScopedChallenges(admin: Admin, parent: { scope: "map" | "campaign"; id: number }, input: { challengeIds?: unknown }): Promise<Result> {
  const ids = idArray(input.challengeIds, 2_000);
  const onMap = parent.scope === "map";
  return commandTransaction(async (tx) => {
    const rows = await tx.select({ id: challenge.id, name: challenge.name }).from(challenge)
      .where(and(
        onMap ? eq(challenge.mapId, parent.id) : eq(challenge.campaignId, parent.id),
        eq(challenge.scope, parent.scope), isNull(challenge.deletedAt),
      ))
      .orderBy(asc(challenge.sortOrder), asc(challenge.id));
    const owned = new Map(rows.map((row) => [row.id, row.name]));
    const ordered = ids.filter((id) => owned.has(id));
    if (ordered.length !== rows.length) return failure(`挑战顺序与当前${onMap ? "地图" : "地图包"}的挑战不一致，请刷新后重试。`, 409);
    for (const [index, id] of ordered.entries()) await tx.update(challenge).set({ sortOrder: index }).where(eq(challenge.id, id));
    const parentRow = onMap
      ? await tx.select({ name: map.name }).from(map).where(eq(map.id, parent.id)).limit(1)
      : await tx.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, parent.id)).limit(1);
    const lines = diffLines([["挑战顺序", rows.map((row) => row.name).join(" → "), ordered.map((id) => owned.get(id)).join(" → ")]]);
    await writeAudit(tx, admin, onMap ? "调整挑战顺序" : "调整多地图挑战顺序",
      `${onMap ? "地图" : "地图包"} ${parentRow[0]?.name ?? parent.id}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export const saveChallengeOrder = (admin: Admin, mapId: number, input: { challengeIds?: unknown }) =>
  reorderScopedChallenges(admin, { scope: "map", id: mapId }, input);

export const saveMultiMapChallengeOrder = (admin: Admin, campaignId: number, input: { challengeIds?: unknown }) =>
  reorderScopedChallenges(admin, { scope: "campaign", id: campaignId }, input);
