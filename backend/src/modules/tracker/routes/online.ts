import { jsonResponse, afterResponse } from "../../../plugins/http";
import { presenceTransaction } from "../tracker-presence-service";
import { readOnlinePlayers } from "../online";
import { bilibiliLiveCache } from "../../../integrations/bilibili-live";

export async function GET() {
  const players = await readOnlinePlayers(presenceTransaction, uids => bilibiliLiveCache.read(uids, afterResponse));
  return jsonResponse({ players }, { headers: { "Cache-Control": "no-store" } });
}
