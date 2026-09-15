import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSourceCache } from "../../../integrations/goldberries-cache.mjs";
import { getConfig, repositoryRoot } from "../config";
import { validGameBananaUrl, type CampaignSuggestions } from "../../../shared/src/gamebanana";
let cache: ReturnType<typeof createSourceCache> | undefined;
export async function goldberriesCatalog() {
  cache ??= createSourceCache({
    directory: pathToFileURL(resolve(repositoryRoot, getConfig().goldberries?.cacheDirectory ?? ".cache/goldberries") + "/"),
    fetchCatalog: async path => {
      const response = await fetch(`https://goldberries.net/api${path}`, { signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (!response.ok) throw new Error(`Goldberries HTTP ${response.status}`);
      return response.json();
    },
  });
  return cache.get();
}
export async function campaignSuggestions(): Promise<CampaignSuggestions> {
  const source = await goldberriesCatalog();
  return { fetchedAt: source.fetchedAt, expiresAt: source.fetchedAt + 7 * 86400_000,
    campaigns: source.campaigns.filter(c => typeof c.name === "string" && c.name.trim() && validGameBananaUrl(c.url))
      .map(c => ({ id: c.id, name: c.name, gameBananaUrl: c.url! })) };
}
