import { getCatalogCache } from "./catalog-cache";
import { submissionsForChallenge } from "./projection";

/** 普通与限定 C/FC 共用公开 DAG 投影；每人保留一条有效记录，不合并不同录像的标签。 */
export function farewellGoldenRecords(mapId: number) {
  const catalog = getCatalogCache();
  const map = catalog.maps.find((item) => item.id === mapId);
  if (!map || !catalog.campaigns.some((item) => item.id === map.campaignId)) return [];
  const records = catalog.challenges
    .filter((challenge) => challenge.mapId === mapId && challenge.type === "C/FC")
    .flatMap((challenge) => submissionsForChallenge(challenge.id));
  const time = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
  records.sort((a, b) => time(a.achievedAt) - time(b.achievedAt) || a.id - b.id);
  const seen = new Set<number>();
  return records.filter((record) => {
    if (seen.has(record.playerId)) return false;
    seen.add(record.playerId);
    return true;
  });
}
