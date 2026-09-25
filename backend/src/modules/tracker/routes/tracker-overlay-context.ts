import { requestUrl, context, type ApiRequest } from "../../../plugins/http";
import { db } from "../../../db/client";
import { withDevice } from "../device-route";
import { loadOverlayContext, overlayScope } from "../overlay-context";
import { readChallengeSelection } from "../challenge-selection";
import { presenceTransaction } from "../tracker-presence-service";

export async function GET(request: ApiRequest) {
  context().reply.header("Cache-Control", "private, no-store");
  return withDevice(request, async principal => {
    const { sid, side } = overlayScope(requestUrl(request));
    const value = await loadOverlayContext(db, sid, side);
    // 玩家上次明确选择的挑战，便于换设备或重装后恢复；只返回仍在列表里的挑战。
    const selected = value.map ? await presenceTransaction(sql => readChallengeSelection(sql, principal.accountId, value.map!.id)) : null;
    return { ...value, selectedChallengeId: value.challenges.some(c => c.id === selected) ? selected : null };
  }, 1024);

}
