import { eq } from "drizzle-orm";
import { pathEntityId } from "../../../../../shared/src/entity-id";
import type { ApiRequest } from "../../../plugins/http";
import { campaign, map, challenge, submission } from "../../../db/schema";
import { goldberriesCatalog } from "../../../integrations/goldberries";
import { adminCommand } from "../../auth/admin-route";
import { commandTransaction } from "../../admin/transaction";
import { done, failure } from "../../admin/common";
import { createChallengeDraft, norm } from "../challenge-draft";
import { previewGoldberries } from "../goldberries-preview";
import { gameBananaKey } from "../goldberries-match";

export async function POST(request: ApiRequest) {
  const id = pathEntityId(request.params.id);
  return adminCommand(request, async (admin, body) => {
    if (body.confirm === true) return commandTransaction(async tx => done(await createChallengeDraft(tx,admin,id,body.token,body.draft)));
    let source: Awaited<ReturnType<typeof goldberriesCatalog>> | undefined;
    try { source = await goldberriesCatalog(); } catch { /* 缓存失败仍允许管理员补全。 */ }
    return commandTransaction(async tx => {
      const current = (await tx.select().from(submission).where(eq(submission.id,id)).limit(1))[0];
      if (!current || current.deletedAt || current.status !== "pending" || current.challengeId || !current.proposedTarget) return failure("提案已处理、撤回或删除。",409);
      const p = current.proposedTarget as Record<string,unknown>;
      const preview = previewGoldberries(id,p,source?.campaigns ?? []), d = preview.draft;
      if (!source) preview.notes.unshift("Goldberries 缓存暂不可用，已填入申请资料，可手动补全。");
      const packs = (await tx.select().from(campaign)).filter(c => !c.deletedAt && (gameBananaKey(d.gameBananaUrl) && gameBananaKey(c.gameBananaUrl) === gameBananaKey(d.gameBananaUrl)
        || [c.name,c.cnName].some(n => n && [p.campaignName,d.campaignName].some(v=>norm(n)===norm(v)))));
      if (packs.length === 1) {
        d.campaignId = packs[0].id; d.campaignName = packs[0].name;
        d.gameBananaUrl = packs[0].gameBananaUrl || d.gameBananaUrl;
        const maps = (await tx.select().from(map).where(eq(map.campaignId,d.campaignId))).filter(m=>!m.deletedAt && [m.name,m.cnName].some(n=>n && norm(n)===norm(d.mapName)));
        if (maps.length === 1) {
          d.mapId=maps[0].id;d.mapName=maps[0].name;
          const targets = (await tx.select().from(challenge).where(eq(challenge.mapId,d.mapId))).filter(c=>!c.deletedAt && c.scope==='map' && norm(c.name)===norm(d.challengeName));
          if(targets.length===1){d.type=targets[0].type;d.tier=targets[0].tierCode as typeof d.tier;d.rules=targets[0].description;preview.notes.push("已有同名挑战，已填入现有类型、难度和规则；保持一致即可复用。");}
        }
      }
      return done(preview);
    });
  });
}
