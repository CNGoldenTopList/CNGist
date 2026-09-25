import { type ApiRequest } from "../../../plugins/http";
import { withDevice } from "../device-route";
import { presenceTransaction } from "../tracker-presence-service";
import { saveChallengeSelection } from "../challenge-selection";

/** Mod 上报玩家当前选择的挑战（或清除）。只决定推送与在线展示取哪个挑战，推送权限仍由 Ping 点决定。 */
export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => presenceTransaction(sql => saveChallengeSelection(sql, principal, body)), 1024);
}
