/** PostgreSQL 客户端调用；凭据不进入命令行或日志。 */
import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { getConfig } from "../../src/config";
export async function pgTool(tool: "pg_dump" | "pg_restore", extra: string[], stdio: SpawnOptions["stdio"]) {
  const config = getConfig().database;
  const url = new URL(config.url);
  const args = ["-h", url.hostname, "-p", url.port || "5432", "-U", decodeURIComponent(url.username), "-d", decodeURIComponent(url.pathname.slice(1)), ...extra];
  const container = config.toolsContainer;
  return new Promise<void>((resolve, reject) => {
    const child = spawn(container ? "docker" : tool, container ? ["exec", "-i", "-e", "PGPASSWORD", container, tool, ...args] : args,
      { stdio, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`${tool} failed (${code})`)));
  });
}
