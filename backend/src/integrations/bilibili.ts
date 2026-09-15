/** B 站公开信息抓取。获取昵称与头像；建新玩家档案时用昵称省去用户手填这一步， */
import { fail, type ApiFailure } from "../../../shared/src/api-errors";

export type BilibiliLookup = { ok: true; name: string; avatarUrl?: string; sign?: string } | ApiFailure;

export { extractBilibiliUid } from "../../../shared/src/bilibili-uid";

/* 手机端 B 站只给得到 BV 号，复制不出完整链接，所以裸 BV 号也当作合法输入补成正式地址。
   分 P 允许写在后面：`BV1xx411c7mD p2`、`BV1xx411c7mD?p=2`、`BV1xx411c7mD-P2` 都识别。 */
const BV_REF_RE = /^(BV[0-9A-Za-z]{10})(?:[\s?&/_-]*(?:p|page)\s*=?\s*(\d{1,4}))?$/i;

/** 裸 BV 号补成完整视频链接；已经是链接或认不出来的输入原样返回，交给后面的 URL 校验。 */
export function expandBilibiliVideoRef(raw: string): string {
  const value = raw.trim();
  const match = value.match(BV_REF_RE);
  if (!match) return value;
  const bvid = `BV${match[1].slice(2)}`;
  const page = Number(match[2] ?? "1");
  return `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`;
}

export async function fetchBilibiliName(uid: string): Promise<BilibiliLookup> {
  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(uid)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        referer: "https://www.bilibili.com/",
      },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return fail("bilibiliUnavailable");
    const reply = await response.json().catch(() => null) as { code?: number; message?: string; data?: { card?: { mid?: string | number; name?: string; face?: string; sign?: string } } } | null;
    if (!reply) return fail("bilibiliUnparsable");
    if (reply.code === -404) return fail("bilibiliNotFound");
    if (reply.code !== 0 || !reply.data?.card?.name) return fail("bilibiliDown");
    if (String(reply.data.card.mid) !== uid) return fail("bilibiliUnparsable");
    return { ok: true, name: reply.data.card.name, avatarUrl: normalizeBilibiliAvatar(reply.data.card.face), sign: typeof reply.data.card.sign === "string" ? reply.data.card.sign : undefined };
  } catch {
    return fail("bilibiliUnavailable");
  }
}

/** 只接受 B 站图片 CDN；历史接口中的 http 地址统一升级为 https。 */
export function normalizeBilibiliAvatar(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.endsWith(".hdslb.com") || url.username || url.password || url.port) return undefined;
    url.protocol = "https:";
    return url.href;
  } catch { return undefined; }
}
