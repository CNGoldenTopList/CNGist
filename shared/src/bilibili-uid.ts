const BARE_UID_RE = /^\d{1,16}$/;
const URL_UID_RE = /(?:^|https?:\/\/)space\.bilibili\.com\/(\d{1,16})(?=[/?#]|$)/i;

/** 允许直接粘贴 B 站主页链接，从里面摘出纯数字 UID。 */
export function extractBilibiliUid(raw: string): string | null {
  const value = raw.trim();
  if (BARE_UID_RE.test(value)) return value;
  const match = value.match(URL_UID_RE);
  return match ? match[1] : null;
}


/** Validate the complete admin input; never silently discard an invalid binding. */
export function parseBilibiliUids(raw: unknown): string[] | null {
  const values = typeof raw === "string" ? raw.split(/[\s,，;；]+/).filter(Boolean) : raw;
  if (!Array.isArray(values) || values.length > 50) return null;
  const uids: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length > 500) return null;
    const uid = extractBilibiliUid(value);
    if (!uid) return null;
    if (!uids.includes(uid)) uids.push(uid);
  }
  return uids;
}

/** Ordered bindings, with a fallback for legacy single-UID profiles. */
export function playerBilibiliUids(player: { bilibiliUids?: unknown; bilibiliUid?: unknown; bilibiliUrl?: unknown }): string[] {
  const uids = parseBilibiliUids(player.bilibiliUids);
  if (uids?.length) return uids;
  const uid = extractBilibiliUid(typeof player.bilibiliUid === "string" ? player.bilibiliUid : "")
    ?? extractBilibiliUid(typeof player.bilibiliUrl === "string" ? player.bilibiliUrl : "");
  return uid ? [uid] : [];
}

export function firstBilibiliLiveRoom(uids: string[], rooms: Map<string, string>): string | null {
  for (const uid of uids) {
    const url = rooms.get(uid);
    if (url) return url;
  }
  return null;
}
