/** 定时任务的一次本地数据库备份；成功后再清理过期副本。 */
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getConfig, repositoryRoot } from "../config";
import { pgTool } from "../../scripts/db/pg-tools";
import { backupsToRemove, type BackupEntry } from "./backup-retention";
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
const entries: BackupEntry[] = [];
for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const match = /^postgres-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[a-f0-9]{8}\.dump$/.exec(entry.name);
  if (!match) continue;
  entries.push({ name: entry.name, timestamp: Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`) });
}
const removed = backupsToRemove(entries, config, Date.now());
for (const name of removed) await rm(resolve(directory, name));
console.log(`Backup saved: ${target}; pruned: ${removed.length}`);
