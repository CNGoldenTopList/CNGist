import { and, asc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index";
import { CctError } from "./cct-state";

export function overlayScope(url: URL) {
  const sid = url.searchParams.get("sid");
  const side = url.searchParams.get("side");
  if (!sid || sid.length > 400 || sid.trim() !== sid || /[\u0000-\u001f]/.test(sid)
    || !side || !["Normal", "BSide", "CSide"].includes(side)) {
    throw new CctError("invalid_overlay_scope");
  }
  return { sid, side };
}

/** Only approved SID/side bindings and active map-scoped catalog entries are exposed. */
export async function loadOverlayContext(database: Pick<NodePgDatabase<typeof schema>, "select">, sid: string, side: string) {
  const { trackerMapBinding: binding, map, campaign, challenge } = schema;
  const [matched] = await database.select({
    id: map.id, name: map.name, cnName: map.cnName,
    campaignId: campaign.id, campaignName: campaign.name, campaignCnName: campaign.cnName,
  }).from(binding).innerJoin(map, eq(map.id, binding.mapId))
    .innerJoin(campaign, eq(campaign.id, map.campaignId))
    .where(and(eq(binding.sid, sid), eq(binding.side, side), eq(binding.status, "approved"),
      isNull(map.deletedAt), isNull(campaign.deletedAt))).limit(1);

  if (!matched) return { schema: "goldenlink.context/1", sid, side, matched: false, map: null, challenges: [] };
  const challenges = await database.select({ id: challenge.id, name: challenge.name,
    type: challenge.type, tier: challenge.tierCode }).from(challenge)
    .where(and(eq(challenge.scope, "map"), eq(challenge.mapId, matched.id), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  return { schema: "goldenlink.context/1", sid, side, matched: true,
    map: { id: matched.id, name: matched.name, cnName: matched.cnName,
      campaign: { id: matched.campaignId, name: matched.campaignName, cnName: matched.campaignCnName } },
    challenges };
}
