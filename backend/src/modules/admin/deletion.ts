/** 回收站永久删除：按实体层级展开范围，再按依赖顺序统一清理。 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { account, campaign, map, challenge, submission, player, playerClaimRequest, suggestion, trackerMapBinding, trashItem, migrationIdMap } from "../../db/schema";
import type { TrashItem } from "../../../../shared/src/admin";
import type { Tx } from "./audit";
import { lockPlayerNames } from "../players/player-names";

type Kind = TrashItem["kind"];
const tables = { campaign, map, challenge, record: submission, player };
export type DeletionScope = Record<Kind, number[]>;

/** 与玩家创建/恢复采用相同的锁顺序；选取范围后不允许再插入子项。 */
export async function lockDeletion(tx: Tx) {
  await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
  await lockPlayerNames(tx);
  await tx.execute(sql`LOCK TABLE campaign, map, challenge, player, submission, trash_item IN SHARE ROW EXCLUSIVE MODE`);
}

async function collectScope(tx: Tx, kind: Kind, id: number): Promise<DeletionScope> {
  const table = tables[kind];
  const [root] = await tx.select({ id: table.id, deletedAt: table.deletedAt }).from(table).where(eq(table.id,id)).for("update");
  if (!root?.deletedAt) throw Object.assign(new Error("目标不存在或已恢复，请刷新回收站。"),{statusCode:409});
  const scope: DeletionScope = {campaign:[],map:[],challenge:[],record:[],player:[]};
  scope[kind] = [id];
  if (scope.campaign.length) scope.map = (await tx.select({id:map.id}).from(map).where(inArray(map.campaignId,scope.campaign))).map(r=>r.id);
  if (scope.campaign.length || scope.map.length) scope.challenge = (await tx.select({id:challenge.id}).from(challenge)
    .where(or(inArray(challenge.campaignId,scope.campaign),inArray(challenge.mapId,scope.map)))).map(r=>r.id);
  if (scope.challenge.length || scope.player.length) scope.record = (await tx.select({id:submission.id}).from(submission)
    .where(or(inArray(submission.challengeId,scope.challenge),inArray(submission.playerId,scope.player)))).map(r=>r.id);
  return scope;
}

/** 调用者负责同一事务内的超级管理员鉴权及审计。 */
export async function deleteTrashedEntity(tx: Tx, kind: Kind, id: number) {
  await lockDeletion(tx);
  const scope = await collectScope(tx,kind,id);
  // 保留讨论正文、回复与身份申请历史，仅解除已删除目标的引用。
  if(scope.campaign.length) await tx.update(suggestion).set({campaignId:null}).where(inArray(suggestion.campaignId,scope.campaign));
  if(scope.map.length) await tx.update(suggestion).set({mapId:null}).where(inArray(suggestion.mapId,scope.map));
  if(scope.challenge.length) await tx.update(suggestion).set({challengeId:null}).where(inArray(suggestion.challengeId,scope.challenge));
  if(scope.player.length) {
    await tx.update(account).set({claimedPlayerId:null}).where(inArray(account.claimedPlayerId,scope.player));
    await tx.update(playerClaimRequest).set({resultPlayerId:null}).where(inArray(playerClaimRequest.resultPlayerId,scope.player));
  }
  for (const kind of Object.keys(scope) as Kind[]) {
    const ids = scope[kind];
    if (!ids.length) continue;
    await tx.delete(trashItem).where(and(eq(trashItem.kind,kind),inArray(trashItem.targetId,ids)));
    await tx.delete(migrationIdMap).where(and(inArray(migrationIdMap.entity,kind === "record" ? ["record","submission"] : [kind]),inArray(migrationIdMap.newId,ids)));
  }
  // 现有外键级联清理标签、愿望单、DAG、大厅、菜单、头像和带金房间依赖。
  if(scope.record.length) await tx.delete(submission).where(inArray(submission.id,scope.record));
  if(scope.challenge.length) await tx.delete(challenge).where(inArray(challenge.id,scope.challenge));
  if(scope.map.length) {
    await tx.delete(trackerMapBinding).where(inArray(trackerMapBinding.mapId,scope.map));
    await tx.delete(map).where(inArray(map.id,scope.map));
  }
  if(scope.campaign.length) await tx.delete(campaign).where(inArray(campaign.id,scope.campaign));
  if(scope.player.length) await tx.delete(player).where(inArray(player.id,scope.player));
  return scope;
}
