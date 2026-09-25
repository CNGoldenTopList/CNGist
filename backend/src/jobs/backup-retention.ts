/** 按北京时间的自然日、周（一至日）、月保留各桶最新的一份。 */
export type BackupEntry = { name: string; timestamp: number };
export type Retention = { keepDays: number; keepWeeks?: number; keepMonths?: number };
const DAY = 86400_000;
function buckets(timestamp: number) {
  const local = new Date(timestamp + 8 * 3600_000);
  const day = Math.floor(local.getTime() / DAY);
  return [day, Math.floor((day + 3) / 7), local.getUTCFullYear() * 12 + local.getUTCMonth()];
}
export function backupsToRemove(entries: BackupEntry[], policy: Retention, now: number): string[] {
  const limits = [policy.keepDays, policy.keepWeeks ?? 4, policy.keepMonths ?? 12];
  const current = buckets(now);
  const seen = [new Set<number>(), new Set<number>(), new Set<number>()];
  const remove: string[] = [];
  for (const entry of [...entries].sort((a, b) => b.timestamp - a.timestamp || b.name.localeCompare(a.name))) {
    // 时钟异常或时间未知时不删除。
    if (!Number.isFinite(entry.timestamp) || entry.timestamp > now) continue;
    let keep = false;
    buckets(entry.timestamp).forEach((bucket, index) => {
      const age = current[index]! - bucket;
      if (age >= 0 && age < limits[index]! && !seen[index]!.has(bucket)) {
        seen[index]!.add(bucket);
        keep = true;
      }
    });
    if (!keep) remove.push(entry.name);
  }
  return remove;
}
