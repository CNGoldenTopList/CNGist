import type { SourceCampaign } from "../../../../integrations/goldberries-cache.mjs";
import { validGameBananaUrl } from "../../../../shared/src/gamebanana";

const norm = (v: unknown) => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export function gameBananaKey(value: unknown) {
  return validGameBananaUrl(value) ? new URL(value.trim()).pathname.replace(/\/$/, "") : null;
}
type SourceChallenge = { id: number; map_id: number; campaign_id: number | null; is_rejected?: boolean; is_arbitrary?: boolean; requires_fc?: boolean; has_fc?: boolean; label?: string; description?: string; objective?: { name: string }; difficulty?: { name: string; sort: number } };
type SourceMap = { id: number; campaign_id: number; name: string; is_archived?: boolean; counts_for_id?: number; challenges: SourceChallenge[] };
export function matchGoldberries(id: number, p: Record<string, unknown>, campaigns: SourceCampaign[], link: string) {
  const packs = campaigns.filter(c => gameBananaKey(c.url) === gameBananaKey(link));
  if (packs.length !== 1) throw new Error("缓存中的地图包未唯一匹配，请手动选择归属。");
  const maps = (packs[0].maps as SourceMap[]).filter(m => m.campaign_id === packs[0].id && !m.is_archived && m.counts_for_id == null && norm(m.name) === norm(p.mapName));
  if (maps.length !== 1) throw new Error("缓存中的地图名未唯一匹配，请手动选择归属。");
  const name = String(p.challengeName).trim();
  const plain = ["C", "FC", "C/FC"].includes(name.toUpperCase());
  const requested = plain ? name.toUpperCase() : /(?:\[|［)(C\/FC|FC|C)(?:\]|］)$|\s+(C\/FC|FC|C)$/i.exec(name)?.slice(1).find(Boolean)?.toUpperCase();
  const type = (c: SourceChallenge) => c.requires_fc ? "FC" : c.has_fc ? "C/FC" : "C";
  const base = norm(name).replace(/\s*(?:[\[［](?:c\/fc|fc|c)[\]］]|\s+(?:c\/fc|fc|c))$/, "").trim();
  const matches = maps[0].challenges.filter(c => !c.is_rejected && c.map_id === maps[0].id && c.campaign_id == null
    && requested && (requested === type(c) || type(c) === "C/FC" && ["C", "FC"].includes(requested))
    && norm(p.rules) === norm(c.description)
    && (plain ? ["Golden Berry", "Silver Berry", "Deathless"].includes(c.objective?.name ?? "") && !norm(c.label) && !norm(c.description) && !c.is_arbitrary
      : base === norm(c.objective?.name) && (!norm(c.label) || base === norm(c.label))));
  if (matches.length !== 1) throw new Error("挑战目标、C/FC、限定或规则未唯一匹配，请手动选择归属。");
  const c = matches[0], difficulty = c.difficulty;
  const tier = difficulty?.name === "Untiered" ? "low-std" : difficulty && difficulty.sort >= 1 && difficulty.sort <= 3 && difficulty.name === `Tier ${difficulty.sort}` ? (["low-std", "mid-std", "high-std"] as const)[difficulty.sort - 1] : null;
  return { submissionId: id, proposalTarget: p, campaignName: String(p.campaignName), mapName: String(p.mapName), challengeName: String(p.challengeName),
    targetChallengeName: plain ? type(c) : String(p.challengeName), targetType: type(c), tier,
    resolvedGameBananaUrl: link, sourceUrl: `https://goldberries.net/challenge/${c.id}`,
    sourceObjective: c.objective!.name, sourceDifficulty: difficulty?.name ?? "未提供", sourceLabel: c.label ?? "", sourceDescription: c.description ?? "",
    addFcTag: requested === "FC", matchEvidence: "缓存中的链接、地图名、完整目标和规则唯一匹配" };
}
