import { jsonResponse } from "../../../plugins/http";
import { listAllMaps } from "../catalog";
export async function GET() {
  const maps = await listAllMaps();
  return jsonResponse({ maps: maps.map(m => ({ id: m.id, name: m.name, stars: m.histStars, subTier: m.histSubTier })) });
}
