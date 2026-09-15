import { type ApiRequest } from "../../../plugins/http";
import { trackerCct } from "../tracker-cct-service";
import { withDevice } from "../device-route";

/** 本体存档的通关标记、累计死亡与无金通关最少死亡。与 CCT 镜像互相独立。 */
export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => trackerCct.reportAreaStats(principal, {
    datasetId: body.datasetId as string,
    sid: body.sid as string,
    side: body.side as string,
    noGoldenBestDeaths: (body.noGoldenBestDeaths ?? null) as number | null,
    completed: (body.completed ?? null) as boolean | null,
    totalDeaths: (body.totalDeaths ?? null) as number | null,
    source: body.source as string,
    practiceDetection: body.practiceDetection as string,
  }));
}
