/** 消费网站心跳事务产生的提醒；仍由统一消息服务走已有反向 WS。 */
import { tsImport } from "tsx/esm/api";
import { appConfig } from "./config.mjs";
import { Pool } from "pg";
const [{ claimGoldenRoomEvent }, { createBilibiliLiveCache }, { playerBilibiliUids, firstBilibiliLiveRoom }] = await Promise.all([
  tsImport("../backend/src/modules/tracker/golden-room-alerts.ts",import.meta.url),
  tsImport("../backend/src/integrations/bilibili-live.ts",import.meta.url),
  tsImport("../shared/src/bilibili-uid.ts",import.meta.url),
]);

const compact = value => {
  const text = String(value ?? "").replace(/\s+/g," ").trim();
  return text.length > 160 ? text.slice(0,160) + "…" : text;
};
export function formatGoldenRoomAlert(event,liveUrl) {
  return ["🍓 CN 金榜 · 带金到达", "━━━━━━━━━━━━",
    `${compact(event.playerName)} 带金进入了目标房间！`,
    `${compact(event.campaignName)} › ${compact(event.mapName)}`,
    `房间：${compact(event.roomName)}${event.roomName !== event.roomKey ? `（${compact(event.roomKey)}）` : ""}`,
    "",liveUrl ? `📺 直播间：${liveUrl}` : "📺 暂未获取到正在直播的房间",
    ...(event.extraText ? ["",event.extraText] : []),
  ].join("\n");
}

export function createGoldenRoomPoller({ config, messages, connected, transaction, liveCache = createBilibiliLiveCache() }) {
  let busy = false;
  return async () => {
    if (busy || !config.enabledGroups[0] || !connected()) return;
    busy = true;
    try {
      for (let i=0;i<5;i++) {
        const event = await transaction(claimGoldenRoomEvent);
        if (!event) break;
        try {
          const uids = playerBilibiliUids(event);
          const work = [];
          if (uids.length) liveCache.read(uids, task => work.push(task()));
          await Promise.all(work);
          const liveUrl = firstBilibiliLiveRoom(uids, liveCache.read(uids, () => {}));
          await messages.send(config.enabledGroups[0],formatGoldenRoomAlert(event,liveUrl));
          await transaction(sql => sql.query("UPDATE golden_room_event SET status='sent' WHERE id=$1",[event.id]));
        } catch(error) {
          await transaction(sql => sql.query("UPDATE golden_room_event SET status='failed' WHERE id=$1",[event.id]));
          process.stderr.write(`[qqbot] 带金提醒 ${event.id} 发送失败：${error.message}\n`);
        }
      }
    } finally { busy = false; }
  };
}

export async function startGoldenRoomWorker(options) {
  // 与后端共用 config.json 指定的新库。
  const pool = new Pool({connectionString:appConfig.database.url,max:2,idleTimeoutMillis:30_000});
  const transaction = async work => {
    const client = await pool.connect();
    try { await client.query("BEGIN");const result = await work(client);await client.query("COMMIT");return result; }
    catch(error) { await client.query("ROLLBACK");throw error; }
    finally { client.release(); }
  };
  const poll = createGoldenRoomPoller({...options,transaction});
  const tick = () => poll().catch(error => process.stderr.write(`[qqbot] 带金提醒读取失败：${error.message}\n`));
  const timer = setInterval(tick,2000);
  timer.unref();
  return () => { clearInterval(timer); void pool.end(); };
}
