/** Process-local derived cache. Missing/failed lookups never mean “offline”. */
export function createBilibiliLiveCache(fetcher: typeof fetch = fetch, now = Date.now) {
  const entries = new Map<string, { url: string | null; refreshAt: number; staleAt: number }>();
  const pending = new Set<string>();
  let retryAt = 0;

  async function refresh(uids: string[]) {
    try {
      // Bound URL size and upstream concurrency, even for a large online list.
      for (let offset = 0; offset < uids.length; offset += 50) {
        const batch = uids.slice(offset, offset + 50);
        const params = new URLSearchParams();
        for (const uid of batch) params.append("uids[]", uid);
        const response = await fetcher(`https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?${params}`, {
          headers: { "user-agent": "Mozilla/5.0", referer: "https://live.bilibili.com/" },
          signal: AbortSignal.timeout(3_000), cache: "no-store",
        });
        if (!response.ok) throw new Error("Live lookup unavailable");
        const reply = await response.json();
        if (reply?.code !== 0 || !reply.data || typeof reply.data !== "object") throw new Error("Invalid live lookup");
        for (const uid of batch) {
          const room = reply.data[uid];
          const roomId = room?.room_id;
          const validLive = room?.live_status === 1 && Number.isSafeInteger(roomId) && roomId > 0;
          const confirmedOffline = room?.live_status === 0 || room?.live_status === 2;
          const previous = entries.get(uid);
          if (validLive || confirmedOffline) {
            entries.set(uid, { url: validLive ? `https://live.bilibili.com/${roomId}` : null,
              refreshAt: now() + 60_000, staleAt: now() + 300_000 });
          } else {
            // Missing or malformed users are unknown, not evidence of a stream ending.
            entries.set(uid, { url: previous?.url ?? null, refreshAt: now() + 60_000,
              staleAt: previous?.staleAt ?? now() + 300_000 });
          }
        }
      }
    } catch {
      retryAt = now() + 60_000;
    } finally {
      for (const uid of uids) pending.delete(uid);
    }
  }

  return {
    read(uids: string[], schedule: (work: () => Promise<void>) => void): Map<string, string> {
      const time = now();
      // Keep the last confirmed result during refresh, but bound stale data after outages.
      for (const [uid, entry] of entries) if (entry.staleAt <= time) entries.delete(uid);
      const unique = [...new Set(uids)].filter(uid => /^\d{1,16}$/.test(uid));
      const missing = unique.filter(uid => (!entries.has(uid) || entries.get(uid)!.refreshAt <= time) && !pending.has(uid));
      if (missing.length && time >= retryAt) {
        for (const uid of missing) pending.add(uid);
        schedule(() => refresh(missing));
      }
      return new Map(unique.flatMap(uid => {
        const url = entries.get(uid)?.url;
        return url ? [[uid, url] as const] : [];
      }));
    },
  };
}

export const bilibiliLiveCache = createBilibiliLiveCache();
