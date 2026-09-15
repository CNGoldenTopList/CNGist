/** 站内链接的构造。 */

/** 单地图挑战：地图页 + 选中参数 */
export const challengeHref = (challengeId: number, mapId: number) =>
  `/map/${mapId}?c=${encodeURIComponent(challengeId)}`;

/** 多地图挑战仍是独立实体，有自己的页面 */
export const multiChallengeHref = (challengeId: number) => `/multi-challenge/${challengeId}`;
