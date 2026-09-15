export interface SourceCampaign { id: number; name: string; url?: string; maps: unknown[]; challenges: unknown[] }
export interface SourceCatalog { fetchedAt: number; revision: string; campaigns: SourceCampaign[] }
export const CATALOG_PATH: string;
export function validateCatalog(value: unknown): SourceCampaign[];
export function createSourceCache(options: { directory: URL; fetchCatalog: (path: string) => Promise<unknown>; now?: () => number }): { get(): Promise<SourceCatalog> };
