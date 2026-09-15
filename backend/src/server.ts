/** HTTP 服务启动与连接池关闭。 */
import { buildApp } from "./app";
import { getConfig } from "./config";
import { pool } from "./db/client";
const app = await buildApp();
app.addHook("onClose", async () => { await pool.end(); });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
await app.listen({ host: getConfig().server.host, port: getConfig().server.port });
