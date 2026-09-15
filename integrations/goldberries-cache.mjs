import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const CATALOG_PATH = '/campaign?id=all&maps=true&challenges=true&empty=true&rejected=true';
export function validateCatalog(campaigns) {
  if (!Array.isArray(campaigns) || !campaigns.length) throw new Error('来源目录为空或格式无效');
  const ids = new Set();
  for (const c of campaigns) {
    if (!Number.isSafeInteger(c.id) || c.id < 1 || ids.has(c.id) || !Array.isArray(c.maps) || !Array.isArray(c.challenges)) throw new Error('来源地图包结构无效');
    ids.add(c.id);
    for (const m of c.maps) {
      if (!Number.isSafeInteger(m.id) || m.campaign_id !== c.id || !Array.isArray(m.challenges)) throw new Error('来源地图归属无效');
      for (const ch of m.challenges) if (!Number.isSafeInteger(ch.id) || ch.map_id !== m.id || ch.campaign_id != null) throw new Error('来源挑战作用域无效');
    }
  }
  return campaigns;
}
export function createSourceCache({ directory, fetchCatalog, now = Date.now }) {
  let pending;
  async function readSaved() {
    const file = new URL('catalog.json', directory);
    let saved;
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('来源缓存损坏，需人工检查', { cause: e }); }
    if (saved && saved.fetchedAt <= now() && now() < saved.fetchedAt + SEVEN_DAYS_MS) {
      validateCatalog(saved.campaigns);
      return saved;
    }
    return null;
  }
  async function load() {
    const saved = await readSaved();
    if (saved) return saved;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = new URL('refresh.lock/', directory);
    const deadline = Date.now() + 60_000;
    while (true) {
      try { await mkdir(lock); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const info = await stat(lock).catch(() => null);
        if (info && Date.now() - info.mtimeMs > 120_000) { await rm(lock, { recursive: true, force: true }); continue; }
        if (Date.now() >= deadline) throw new Error('来源缓存刷新超时');
        await new Promise(resolve => setTimeout(resolve, 200));
        const refreshed = await readSaved();
        if (refreshed) return refreshed;
      }
    }
    try {
      const refreshed = await readSaved();
      if (refreshed) return refreshed;
      const file = new URL('catalog.json', directory);
      const campaigns = validateCatalog(await fetchCatalog(CATALOG_PATH));
      const fresh = { fetchedAt: now(), revision: createHash('sha256').update(JSON.stringify(campaigns)).digest('hex'), campaigns };
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(new URL('catalog.tmp', directory), JSON.stringify(fresh), { mode: 0o600 });
      await rename(new URL('catalog.tmp', directory), file);
      return fresh;
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  return { get() { if (!pending) pending = load().finally(() => { pending = null; }); return pending; } };
}
