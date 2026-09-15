/** 定时任务的一次本地数据库备份；成功后再清理过期副本。 */
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getConfig, repositoryRoot } from "../config";
import { pgTool } from "../../scripts/db/pg-tools";
const config = getConfig().backup;
const directory = resolve(repositoryRoot, config.directory);
await mkdir(directory, { recursive: true, mode: 0o700 });
const name = `postgres-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0,8)}.dump`;
const temporary = resolve(directory, name + ".partial"), target = resolve(directory, name);
const file = await open(temporary, "wx", 0o600);
try { await pgTool("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], ["ignore", file.fd, "inherit"]); }
catch (error) { await rm(temporary, { force: true }); throw error; }
finally { await file.close(); }
await rename(temporary, target);
for (const name of await readdir(directory)) {
  if (!/^postgres-[0-9T-Z-]+-[a-f0-9]{8}\.dump$/.test(name)) continue;
  const path = resolve(directory, name);
  if ((await stat(path)).mtimeMs < Date.now() - config.keepDays * 86400_000) await rm(path);
}
console.log(`Backup saved: ${target}`);
