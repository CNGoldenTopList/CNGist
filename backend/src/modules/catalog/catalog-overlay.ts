import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import {
  campaignHall, campaignHallMap, campaignMenuItem, challenge,
  challengeRelation, challengeRelationOverride, map,
} from "../../db/schema/index";
import type { CatalogData } from "./catalog-cache";
import { DEFAULT_FAVORITE_CAMPAIGN_IDS, DEFAULT_FIXED_CAMPAIGN_IDS, normalizedCampaignMenu } from "../../../../shared/src/campaign-menu";

/** 目录里那部分「后台配置」：大厅、地图包内排序、DAG 覆盖与顶栏菜单。 */
type CatalogOverlay = Pick<CatalogData, "campaignHalls" | "campaignOrders" | "challengeRelations" | "campaignMenu">;

export async function loadCatalogOverlay(): Promise<CatalogOverlay> {
  const [halls, hallMaps, menu, overrides, edges, challengeRows, mapRows] = await Promise.all([
    db.select().from(campaignHall).orderBy(asc(campaignHall.campaignId), asc(campaignHall.sortOrder)),
    db.select().from(campaignHallMap).orderBy(asc(campaignHallMap.hallId), asc(campaignHallMap.sortOrder)),
    db.select().from(campaignMenuItem).orderBy(asc(campaignMenuItem.section), asc(campaignMenuItem.position)),
    db.select().from(challengeRelationOverride),
    db.select().from(challengeRelation),
    db.select({ id: challenge.id, mapId: challenge.mapId }).from(challenge)
      .where(and(eq(challenge.scope, "map"), isNull(challenge.deletedAt))),
    db.select({ id: map.id, campaignId: map.campaignId, sortOrder: map.sortOrder }).from(map)
      .where(isNull(map.deletedAt)),
  ]);

  const hallMapIds = new Map<number, number[]>();
  for (const row of hallMaps) hallMapIds.set(row.hallId, [...(hallMapIds.get(row.hallId) ?? []), row.mapId]);
  const campaignHalls = halls.map((row) => ({
    id: row.id, campaignId: row.campaignId, name: row.name,
    cnName: row.cnName ?? undefined, aliases: row.aliases ?? undefined,
    color: row.color, order: row.sortOrder, mapIds: hallMapIds.get(row.id) ?? [],
  }));

  const assigned = new Set(hallMaps.map((row) => row.mapId));
  const campaignOrders: Record<string, string[]> = {};
  const roots = new Map<number, Array<{ token: string; order: number }>>();
  for (const row of mapRows) {
    if (assigned.has(row.id)) continue;
    roots.set(row.campaignId, [...(roots.get(row.campaignId) ?? []), { token: `map:${row.id}`, order: row.sortOrder ?? 1_000_000 }]);
  }
  for (const row of halls) {
    roots.set(row.campaignId, [...(roots.get(row.campaignId) ?? []), { token: `hall:${row.id}`, order: row.sortOrder }]);
  }
  for (const [campaignId, items] of roots) {
    campaignOrders[campaignId] = items.sort((a, b) => a.order - b.order || a.token.localeCompare(b.token)).map((item) => item.token);
  }

  const challengeMap = new Map(challengeRows.map((row) => [row.id, row.mapId!]));
  const relationByMap: CatalogOverlay["challengeRelations"] = {};
  for (const row of overrides) relationByMap[row.mapId] = [];
  for (const edge of edges) {
    const mapId = challengeMap.get(edge.fromId);
    if (mapId && mapId === challengeMap.get(edge.toId) && Object.hasOwn(relationByMap, mapId)) {
      relationByMap[mapId].push({ from: edge.fromId, to: edge.toId });
    }
  }

  const fixed = menu.filter((item) => item.section === "fixed").map((item) => item.campaignId);
  const favorites = menu.filter((item) => item.section === "default_favorite").map((item) => item.campaignId);
  const normalized = normalizedCampaignMenu(
    fixed.length ? fixed : DEFAULT_FIXED_CAMPAIGN_IDS,
    favorites.length ? favorites : DEFAULT_FAVORITE_CAMPAIGN_IDS,
  );
  return {
    campaignHalls,
    campaignOrders,
    challengeRelations: relationByMap,
    campaignMenu: { fixed: normalized.fixed, favorites: normalized.favorites },
  };
}
