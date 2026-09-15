import type { SourceCampaign } from "../../../../integrations/goldberries-cache.mjs";
import type { ChallengeDraftPreview } from "../../../../shared/src/challenge-draft";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import { gameBananaKey, matchGoldberries } from "./goldberries-match";
import { norm, proposalToken } from "./challenge-draft";
const compact = (v: unknown) => norm(v).replace(/[\s_-]/g, "");
export function previewGoldberries(id: number, p: Record<string, unknown>, sources: SourceCampaign[]): ChallengeDraftPreview {
  const notes: string[] = [];
  let link = String(p.gameBananaUrl ?? "");
  const packs = sources.filter(c => gameBananaKey(link) ? gameBananaKey(c.url) === gameBananaKey(link) : compact(c.name) === compact(p.campaignName));
  const pack = packs.length === 1 ? packs[0] : undefined;
  if (pack && !gameBananaKey(link) && gameBananaKey(pack.url)) { link = pack.url!; notes.push("已按地图包名称补全来源链接，请核对。"); }
  if (!pack) notes.push(packs.length > 1 ? "找到多个同名来源地图包，请补全链接以确定归属。" : "缓存未唯一匹配地图包，可手动补全资料后建立。");
  const suggested = typeof p.suggestedTier === "string" && isDifficultyCode(p.suggestedTier) ? p.suggestedTier : null;
  const name = String(p.challengeName ?? "");
  const requested = /^(C\/FC|FC|C)$|[\[［](C\/FC|FC|C)[\]］]$|\s+(C\/FC|FC|C)$/i.exec(name)?.slice(1).find(Boolean)?.toUpperCase() ?? null;
  const result: ChallengeDraftPreview = { token:proposalToken(p), notes, sourceMapNames: pack?.maps.map(m => String((m as {name:string}).name)) ?? [], draft:{
    campaignId:null,mapId:null,campaignName:pack?.name || String(p.campaignName ?? ""),mapName:String(p.mapName ?? ""),challengeName:name,
    gameBananaUrl:link,type:requested,tier:suggested,rules:String(p.rules ?? ""),
  } };
  if (pack) {
    try {
      const plan = matchGoldberries(id,p,sources,link);
      Object.assign(result.draft,{challengeName:plan.targetChallengeName,type:plan.targetType,...(plan.tier ? {tier:plan.tier} : {})});
      Object.assign(result,{sourceUrl:plan.sourceUrl,sourceDifficulty:plan.sourceDifficulty,sourceObjective:plan.sourceObjective});
      notes.push(plan.tier ? "已匹配完整挑战并补全来源难度，请核对后建立。" : `已匹配挑战，来源难度为 ${plan.sourceDifficulty}，请管理员确认本站难度。`);
      if (!plan.tier && suggested) notes.push("难度暂用申请人建议，请核对。");
    } catch (error) {
      notes.push((error as Error).message.replace(/，请手动选择归属。|，请人工建档。/g,"。") + " 已保留匹配到的地图包资料，其余字段可手动补全。");
      if (suggested) notes.push("难度暂用申请人建议，尚未由来源确认，请核对。");
    }
  } else if (suggested) notes.push("难度暂用申请人建议，请核对。");
  return result;
}
