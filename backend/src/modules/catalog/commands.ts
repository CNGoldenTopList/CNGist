/** commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { nextEntityId } from "../../db/ids";
import { entityId, pathEntityId } from "../../../../shared/src/entity-id";
import { parseMapHist, histLabel } from "../../../../shared/src/hist";
import { and, eq, isNull } from "drizzle-orm";
import { campaign, challenge, map } from "../../db/schema/index";
import { challengeLabel, diffLines, writeAudit, type Tx } from "../admin/audit";
import { Admin, Result, clean, failure, optional, validUrl, stringArray, done, tierCode } from "../admin/common";

export type CampaignPatch = { name?: unknown; cnName?: unknown; aliases?: unknown; banner?: unknown; publicationUrl?: unknown; notice?: unknown };

export async function updateCampaign(admin: Admin, id: number, patch: CampaignPatch): Promise<Result> {
  const name = clean(patch.name, 300);
  if (!name) return failure("地图包名称不能为空。");
  const publicationUrl = optional(patch.publicationUrl, 2_000);
  if (publicationUrl && !validUrl(publicationUrl)) return failure("发布地址无效。");
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(campaign).where(eq(campaign.id, id)).limit(1);
    const before = rows[0];
    if (!before) return failure("地图包不存在。", 404);
    const after = {
      name, shortName: name, cnName: optional(patch.cnName, 300),
      searchAliases: stringArray(patch.aliases), banner: optional(patch.banner, 2_000),
      gameBananaUrl: publicationUrl, notice: optional(patch.notice, 4_000),
    };
    await tx.update(campaign).set(after).where(eq(campaign.id, id));
    const lines = diffLines([
      ["英文名", before.name, after.name], ["中文名", before.cnName, after.cnName],
      ["中文别名", before.searchAliases, after.searchAliases],
      ["发布地址", before.gameBananaUrl, after.gameBananaUrl],
      ["注意事项", before.notice, after.notice],
      ["展示图", before.banner ? "已有" : "", after.banner ? "已有" : ""],
    ]);
    await writeAudit(tx, admin, "修改地图包资料", `修改地图包 ${before.name}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export type MapPatch = { histRating?: unknown; name?: unknown; cnName?: unknown; aliases?: unknown; banner?: unknown; notice?: unknown };

export async function updateMap(admin: Admin, id: number, patch: MapPatch): Promise<Result> {
  const name = clean(patch.name, 300);
  if (!name) return failure("地图名称不能为空。");
  const hist = patch.histRating === undefined ? undefined : parseMapHist(patch.histRating);
  if (patch.histRating !== undefined && !hist) return failure("Hist 等级无效。");
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(map).where(and(eq(map.id, id), isNull(map.deletedAt))).limit(1).for("update");
    const before = rows[0];
    if (!before) return failure("地图不存在。", 404);
    const after = {
      histStars: hist === undefined ? before.histStars : hist.histStars,
      histSubTier: hist === undefined ? before.histSubTier : hist.histSubTier,
      name, cnName: optional(patch.cnName, 300), searchAliases: stringArray(patch.aliases),
      banner: optional(patch.banner, 2_000), notice: optional(patch.notice, 4_000),
    };
    await tx.update(map).set(after).where(eq(map.id, id));
    const histText = (value: typeof before | typeof after) => value.histStars === null ? "无评级" : histLabel({ stars: value.histStars, subTier: value.histSubTier as "lower" | "upper" | null });
    const lines = diffLines([
      ["Hist 等级", histText(before), histText(after)],
      ["英文名", before.name, after.name], ["中文名", before.cnName, after.cnName],
      ["中文别名", before.searchAliases, after.searchAliases], ["注意事项", before.notice, after.notice],
      ["展示图", before.banner ? "已有" : "", after.banner ? "已有" : ""],
    ]);
    await writeAudit(tx, admin, "修改地图资料", `修改地图 ${before.name}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export type ChallengePatch = { name?: unknown; tier?: unknown; notice?: unknown };

export async function updateChallenge(admin: Admin, id: number, patch: ChallengePatch): Promise<Result> {
  const name = clean(patch.name, 300);
  if (!name) return failure("挑战名称不能为空。");
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(challenge).where(eq(challenge.id, id)).limit(1);
    const before = rows[0];
    if (!before) return failure("挑战不存在。", 404);
    const label = await challengeLabel(tx, id);
    const after = { name, tierCode: tierCode(patch.tier), notice: optional(patch.notice, 4_000) };
    await tx.update(challenge).set(after).where(eq(challenge.id, id));
    const lines = diffLines([
      ["名称", before.name, after.name], ["难度", before.tierCode, after.tierCode],
      ["注意事项", before.notice, after.notice],
    ]);
    await writeAudit(tx, admin, "修改挑战资料", `修改挑战 ${label}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export type ChallengeInput = { name?: unknown; tier?: unknown; notice?: unknown };

export type MapInput = { name?: unknown; cnName?: unknown; aliases?: unknown; banner?: unknown; notice?: unknown; challenges?: ChallengeInput[] };

export type CreateInput = {
  kind?: unknown; name?: unknown; cnName?: unknown; aliases?: unknown; banner?: unknown;
  publicationUrl?: unknown; notice?: unknown; campaignId?: unknown; mapId?: unknown;
  tier?: unknown; maps?: MapInput[]; challenges?: ChallengeInput[]; order?: unknown; scope?: unknown;
};

export async function insertChallenges(tx: Tx, mapId: number, rows: ChallengeInput[], startOrder: number) {
  const values = rows.filter((row) => clean(row.name, 300)).map((row, index) => ({
    scope: "map", mapId, name: clean(row.name, 300),
    type: "Other", tierCode: tierCode(row.tier), notice: optional(row.notice, 4_000),
    sortOrder: startOrder + index,
  }));
  return values.length ? await tx.insert(challenge).values(values).returning() : [];
}

export async function importCatalogMaps(admin: Admin, body: Record<string, unknown>): Promise<Result<unknown>> {
  const { parseCatalogImport } = await import("../tracker/catalog-import");
  const input = parseCatalogImport(body);
  if (!input) return failure("需要地图包 ID 和 1–200 条 SID/面/正式名称；名称或 SID/面不能重复。");
  const { importCatalogMapsTransaction } = await import("../catalog/catalog-map-import");
  return commandTransaction(tx => importCatalogMapsTransaction(tx, admin, input));
}

export async function createCatalogEntity(admin: Admin, input: CreateInput): Promise<Result<{ id: number }>> {
  const kind = clean(input.kind, 32);
  const name = clean(input.name, 300);
  if (!name) return failure("请填写名称。");
  const publicationUrl = optional(input.publicationUrl, 2_000);
  if (publicationUrl && !validUrl(publicationUrl)) return failure("发布地址无效。");
  const order = stringArray(input.order, 2_000);

  if (kind === "campaign") {
    return commandTransaction(async (tx) => {
      const campaignId = await nextEntityId("campaign", tx);
      await tx.insert(campaign).values({
        id: campaignId, name, shortName: name, cnName: optional(input.cnName, 300),
        searchAliases: stringArray(input.aliases), banner: optional(input.banner, 2_000),
        gameBananaUrl: publicationUrl, url: publicationUrl ?? "#", notice: optional(input.notice, 4_000), author: "",
      });
      let mapCount = 0; let challengeCount = 0;
      for (const [index, row] of (input.maps ?? []).filter((item) => clean(item.name, 300)).entries()) {
        const mapId = await nextEntityId("map", tx);
        await tx.insert(map).values({
          id: mapId, campaignId, name: clean(row.name, 300), cnName: optional(row.cnName, 300),
          searchAliases: stringArray(row.aliases), banner: optional(row.banner, 2_000),
          notice: optional(row.notice, 4_000), sortOrder: index,
        });
        mapCount += 1;
        challengeCount += (await insertChallenges(tx, mapId, row.challenges ?? [], 0)).length;
      }
      await writeAudit(tx, admin, "新建地图包", `新建地图包 ${name}\n- 地图：${mapCount} 张\n- 挑战：${challengeCount} 项`);
      return done({ id: campaignId });
    });
  }

  if (kind === "map") {
    const campaignId = entityId(input.campaignId);
    if (!campaignId) return failure("请选择从属地图包。");
    return commandTransaction(async (tx) => {
      const parent = await tx.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
      if (!parent[0]) return failure("从属地图包不存在。", 404);
      const mapId = await nextEntityId("map", tx);
      const position = order.indexOf("new");
      await tx.insert(map).values({
        id: mapId, campaignId, name, cnName: optional(input.cnName, 300),
        searchAliases: stringArray(input.aliases), banner: optional(input.banner, 2_000),
        notice: optional(input.notice, 4_000), sortOrder: position >= 0 ? position : 1_000_000,
      });
      // 新地图插在指定位置，同级地图整体重排，避免出现重复 sort_order。
      const siblings = order.map((token) => token === "new" ? mapId : pathEntityId(token));
      for (const [index, id] of siblings.entries()) await tx.update(map).set({ sortOrder: index }).where(and(eq(map.id, id), eq(map.campaignId, campaignId)));
      const created = await insertChallenges(tx, mapId, input.challenges ?? [], 0);
      await writeAudit(tx, admin, "新建地图", `新建地图 ${name}\n- 从属地图包：${parent[0].name}\n- 挑战：${created.length} 项`);
      return done({ id: mapId });
    });
  }

  /** 多地图挑战：挂在地图包本身，不属于任何一张具体地图。 */
  if (clean(input.scope, 32) === "campaign") {
    const campaignId = entityId(input.campaignId);
    if (!campaignId) return failure("请选择从属地图包。");
    return commandTransaction(async (tx) => {
      const parent = await tx.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
      if (!parent[0]) return failure("从属地图包不存在。", 404);
      const challengeId = await nextEntityId("challenge", tx);
      await tx.insert(challenge).values({
        id: challengeId, scope: "campaign", campaignId, name,
        tierCode: tierCode(input.tier), notice: optional(input.notice, 4_000), sortOrder: 1_000_000,
      });
      const siblings = order.map((token) => token === "new" ? challengeId : pathEntityId(token));
      for (const [index, id] of siblings.entries()) await tx.update(challenge).set({ sortOrder: index }).where(and(eq(challenge.id, id), eq(challenge.campaignId, campaignId), eq(challenge.scope, "campaign")));
      await writeAudit(tx, admin, "新建多地图挑战", `新建多地图挑战 ${parent[0].name} · ${name}\n- 难度：${tierCode(input.tier)}`);
      return done({ id: challengeId });
    });
  }

  const mapId = entityId(input.mapId);
  if (!mapId) return failure("请选择从属地图。");
  return commandTransaction(async (tx) => {
    const parent = await tx.select({ name: map.name }).from(map).where(eq(map.id, mapId)).limit(1);
    if (!parent[0]) return failure("从属地图不存在。", 404);
    const challengeId = await nextEntityId("challenge", tx);
    await tx.insert(challenge).values({
      id: challengeId, scope: "map", mapId, name, type: "Other",
      tierCode: tierCode(input.tier), notice: optional(input.notice, 4_000), sortOrder: 1_000_000,
    });
    const siblings = order.map((token) => token === "new" ? challengeId : pathEntityId(token));
    for (const [index, id] of siblings.entries()) await tx.update(challenge).set({ sortOrder: index }).where(and(eq(challenge.id, id), eq(challenge.mapId, mapId)));
    await writeAudit(tx, admin, "新建挑战", `新建挑战 ${parent[0].name} · ${name}\n- 难度：${tierCode(input.tier)}`);
    return done({ id: challengeId });
  });
}
