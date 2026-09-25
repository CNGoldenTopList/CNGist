import { type ApiRequest } from "../../../plugins/http";
import { withDevice } from "../device-route";
import { presenceTransaction } from "../tracker-presence-service";
import { captureBerryCollection, parseBerryCollection } from "../golden-room-alerts";

/** Mod 实际收集金/银草莓。只在本人设置过该地图 Ping 点时进入推送队列。 */
export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => {
    const event = parseBerryCollection(body);
    return presenceTransaction(sql => captureBerryCollection(sql, principal, event));
  }, 4096);
}
