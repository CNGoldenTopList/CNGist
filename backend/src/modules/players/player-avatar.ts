import { imageUrl, storeImage } from "../assets/service";
import { playerBilibiliUids } from "../../../../shared/src/bilibili-uid";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { player, playerAvatarCache } from "../../db/schema/index";
import { fetchBilibiliName } from "../../integrations/bilibili";
import { apiErrorText, fail } from "../../../../shared/src/api-errors";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const RETRY_DELAY = 5 * 60 * 1000;
const MANUAL_DELAY = 60 * 1000;

export async function getPlayerAvatar(playerId: number, force = false) {
  return db.transaction(async (tx) => {
    // 锁住同一玩家，导航与个人页并发加载、多进程请求也只抓一次。
    const [owner] = await tx.select().from(player).where(eq(player.id, playerId)).for("update");
    if (!owner || owner.deletedAt) return { ok: false, url: null, error: apiErrorText("playerMissing"), code: "playerMissing" as const, status: 404 };
    const uid = playerBilibiliUids(owner)[0];
    if (!uid) return { ok: !force, url: null, error: apiErrorText("playerNoBilibili"), code: "playerNoBilibili" as const, status: force ? 400 : 200 };
    const [cached] = await tx.select().from(playerAvatarCache).where(eq(playerAvatarCache.playerId, playerId));
    const matching = cached?.bilibiliUid === uid ? cached : undefined;
    const now = Date.now();
    const url = imageUrl(matching?.objectKey);
    if (!force && matching?.fetchedAt && now - matching.fetchedAt.getTime() < WEEK) {
      return { ok: true, url, status: 200 };
    }
    if (matching && now - matching.attemptedAt.getTime() < (force ? MANUAL_DELAY : RETRY_DELAY)) {
      return { ok: !force, url, error: force ? apiErrorText("avatarThrottled") : undefined, code: force ? "avatarThrottled" as const : undefined, status: force ? 429 : 200 };
    }
    const result = await fetchBilibiliName(uid);
    let objectKey = matching?.objectKey ?? null;
    let nextUrl: string | undefined;
    if (result.ok && result.avatarUrl) {
      try {
        const source = new URL(result.avatarUrl);
        if (source.protocol !== "https:" || !/(^|\.)hdslb\.com$/.test(source.hostname)) throw new Error("头像来源无效");
        const response = await fetch(source, { signal: AbortSignal.timeout(10_000), redirect: "error" });
        if (!response.ok || !response.body) throw new Error("头像获取失败");
        const chunks: Uint8Array[] = []; let total = 0;
        for await (const chunk of response.body) { total += chunk.length; if (total > 5 * 1024 * 1024) throw new Error("头像过大"); chunks.push(chunk); }
        const asset = await storeImage(Buffer.concat(chunks), "avatars", tx);
        objectKey = asset.key; nextUrl = asset.url;
      } catch { /* 下次访问按冷却时间重试。 */ }
    }
    await tx.insert(playerAvatarCache).values({
      playerId, bilibiliUid: uid, objectKey,
      fetchedAt: nextUrl ? new Date() : matching?.fetchedAt ?? null,
      attemptedAt: new Date(),
    }).onConflictDoUpdate({ target: playerAvatarCache.playerId, set: {
      bilibiliUid: uid, objectKey,
      fetchedAt: nextUrl ? new Date() : matching?.fetchedAt ?? null,
      attemptedAt: new Date(),
    } });
    if (!nextUrl && force) return { ...(result.ok ? fail("avatarEmpty") : result), url, status: 502 };
    return { ok: true, objectKey, status: 200 };
  });
}
