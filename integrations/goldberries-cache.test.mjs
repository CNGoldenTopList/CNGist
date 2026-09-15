import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSourceCache } from './goldberries-cache.mjs';
const campaigns = [{ id: 1, name: 'Pack', url: 'https://gamebanana.com/mods/123', maps: [], challenges: [] }];
test('shared cache coalesces independent clients, expires at seven days, preserves valid snapshot on failed refresh', async () => {
  const path = await mkdtemp('/tmp/cngist-cache-test-');
  const directory = pathToFileURL(path + '/');
  let now = Date.now(), requests = 0, fail = false;
  const fetchCatalog = async () => { requests++; await new Promise(r => setTimeout(r, 30)); if (fail) throw new Error('offline'); return campaigns; };
  const a = createSourceCache({ directory, fetchCatalog, now: () => now });
  const b = createSourceCache({ directory, fetchCatalog, now: () => now });
  try {
    const [first, other] = await Promise.all([a.get(), b.get()]);
    assert.deepEqual(first, other); assert.equal(requests, 1);
    now += 7 * 86400_000 - 1;
    await a.get(); assert.equal(requests, 1);
    now++; await Promise.all([a.get(), b.get()]); assert.equal(requests, 2);
    const before = await readFile(new URL('catalog.json', directory), 'utf8');
    now += 7 * 86400_000; fail = true;
    await assert.rejects(a.get(), /offline/);
    assert.equal(await readFile(new URL('catalog.json', directory), 'utf8'), before);
    fail = false; await b.get();
    await writeFile(new URL('catalog.json', directory), '{bad');
    await assert.rejects(a.get(), /缓存损坏/);
  } finally { await rm(path, { recursive: true, force: true }); }
});
