/** 菜单中的地图包由管理数据决定。 */
export const CAMPAIGN_MENU_FIXED_SLOTS = 4;
export const CAMPAIGN_MENU_FAVORITE_SLOTS = 6;
export const DEFAULT_FIXED_CAMPAIGN_IDS: number[] = [];
export const DEFAULT_FAVORITE_CAMPAIGN_IDS: number[] = [];
export function normalizedCampaignMenu(fixed: number[] = [], favorites: number[] = []) {
  const unique = [...new Set(fixed)].slice(0, CAMPAIGN_MENU_FIXED_SLOTS);
  return { fixed: unique, favorites: [...new Set(favorites)].filter(id => !unique.includes(id)).slice(0, CAMPAIGN_MENU_FAVORITE_SLOTS) };
}
