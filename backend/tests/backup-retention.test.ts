import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupsToRemove } from '../src/jobs/backup-retention';
const policy = { keepDays: 7, keepWeeks: 4, keepMonths: 12 };
const now = Date.parse('2026-09-25T14:00:00Z');
const entry = (name: string, date: string) => ({ name, timestamp: Date.parse(date) });
test('多年密集备份最多保留23份，近期每日最新一份，旧备份逐渐稀疏', () => {
  const entries = Array.from({ length: 1500 }, (_, i) => ({ name: String(i), timestamp: now - i * 43200_000 }));
  const removed = new Set(backupsToRemove(entries, policy, now));
  const kept = entries.filter(e => !removed.has(e.name));
  assert.ok(kept.length <= 23);
  assert.ok(kept.length > 12);
  for (let i = 0; i < 14; i += 2) assert.ok(!removed.has(String(i)));
  assert.ok(removed.has('1'));
  assert.ok(removed.has('1499'));
  assert.ok(kept.some(e => now - e.timestamp > 300 * 86400_000));
  assert.deepEqual(backupsToRemove(kept, policy, now), []);
});
test('北京时间跨日、周一跨周和跨月边界', () => {
  const entries = [entry('new', '2026-08-31T16:01:00Z'), entry('aug', '2026-08-31T15:59:00Z'), entry('sun', '2026-08-30T15:59:00Z')];
  const reference = Date.parse('2026-08-31T17:00:00Z');
  assert.deepEqual(backupsToRemove(entries, { keepDays: 1, keepWeeks: 0, keepMonths: 0 }, reference), ['aug', 'sun']);
  assert.deepEqual(backupsToRemove(entries, { keepDays: 1, keepWeeks: 2, keepMonths: 0 }, reference), ['aug']);
  assert.deepEqual(backupsToRemove(entries, { keepDays: 1, keepWeeks: 0, keepMonths: 2 }, reference), ['sun']);
});
test('空目录、未来时间及未知时间均安全处理，输入顺序不影响结果', () => {
  assert.deepEqual(backupsToRemove([], policy, now), []);
  const entries = [entry('old', '2020-01-01T00:00:00Z'), entry('future', '2030-01-01T00:00:00Z'), {name:'unknown',timestamp:NaN}, entry('latest', '2026-09-25T14:00:00Z')];
  assert.deepEqual(backupsToRemove(entries, policy, now), ['old']);
  assert.deepEqual(backupsToRemove(entries.reverse(), policy, now), ['old']);
});
