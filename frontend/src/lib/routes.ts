/**
 * 站内链接的构造。
 *
 * 挑战视图并在地图页里：挑战由 /map/<mapId>?c=<challengeId> 承载。
 * 站内链接一律用这里的函数，不要手写 `/challenge/<id>` —— 那条路由
 * 只为已经分享出去的旧地址做重定向。
 */
export const challengeHref = (challengeId: number, mapId: number) => `/map/${mapId}?c=${challengeId}`;
export const multiChallengeHref = (challengeId: number) => `/multi-challenge/${challengeId}`;
export const mapHref = (mapId: number) => `/map/${mapId}`;
export const campaignHref = (campaignId: number) => `/campaign/${campaignId}`;
export const playerHref = (playerId: number) => `/player/${playerId}`;
export const recordHref = (recordId: number) => `/record/${recordId}`;
