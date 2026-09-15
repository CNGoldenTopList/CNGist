/**
 * 头像广播。同一个玩家可能同屏出现多次（顶栏、记录表、在线列表），
 * 刷新头像后让所有实例一起换图，而不是各自再发一次请求。
 */
const subscribers = new Map<number, Set<(value: string | null) => void>>();

export function subscribeAvatar(playerId: number, listener: (value: string | null) => void) {
  const set = subscribers.get(playerId) ?? new Set();
  set.add(listener);
  subscribers.set(playerId, set);
  return () => {
    set.delete(listener);
    if (!set.size) subscribers.delete(playerId);
  };
}

export function announceAvatar(playerId: number, url: string | null) {
  for (const listener of subscribers.get(playerId) ?? []) listener(url);
}
