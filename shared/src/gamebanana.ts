/** Only map download pages identify a submitted pack unambiguously. */
export function validGameBananaUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) return false;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && ["gamebanana.com", "www.gamebanana.com"].includes(url.hostname)
      && !url.username && !url.password && !url.port && /^\/(mods|wips)\/[1-9]\d*\/?$/.test(url.pathname);
  } catch { return false; }
}
export interface CampaignSuggestion { id: number; name: string; gameBananaUrl: string }
export interface CampaignSuggestions { fetchedAt: number; expiresAt: number; campaigns: CampaignSuggestion[] }
