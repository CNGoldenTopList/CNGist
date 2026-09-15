/** graph-commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { nextEntityId } from "../../db/ids";
import { entityId, requiredEntityId } from "../../../../shared/src/entity-id";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { challenge, challengeRelation, challengeRelationOverride, map, submission, submissionTag, trashItem } from "../../db/schema/index";
import { ensureDag, type ChallengeRelation } from "../../../../shared/src/challenge-graph";
import { challengeLabel, diffLines, writeAudit, type Tx } from "../admin/audit";
import { Admin, Result, failure, done, SplitPart, clean, idArray, tierCode, optional } from "../admin/common";

export async function saveMapRelations(admin: Admin, mapId: number, input: { edges?: unknown }): Promise<Result> {
  const raw = Array.isArray(input.edges) ? input.edges : [];
  return commandTransaction(async (tx) => {
    const mapRow = await tx.select({ name: map.name }).from(map).where(and(eq(map.id, mapId), isNull(map.deletedAt))).limit(1);
    if (!mapRow[0]) return failure("地图不存在。", 404);
    await tx.insert(challengeRelationOverride).values({ mapId, updatedBy: admin.id }).onConflictDoNothing();
    await tx.execute(sql`select map_id from challenge_relation_override where map_id = ${mapId} for update`);

    const nodes = await tx.select({ id: challenge.id, name: challenge.name }).from(challenge)
      .where(and(eq(challenge.mapId, mapId), eq(challenge.scope, "map"), isNull(challenge.deletedAt)));
    const nodeIds = nodes.map((row) => row.id);
    const allowed = new Set(nodeIds);
    const names = new Map(nodes.map((row) => [row.id, row.name]));
    const requested: ChallengeRelation[] = raw.map((edge) => ({
      from: requiredEntityId((edge as { from?: unknown }).from), to: requiredEntityId((edge as { to?: unknown }).to),
    }));
    if (requested.some((edge) => !allowed.has(edge.from) || !allowed.has(edge.to))) return failure("关系图中存在不属于该地图的挑战。");
    const edges = ensureDag(nodeIds, requested);
    if (edges.length !== requested.length) return failure("关系图中存在环，请检查后重试。");

    const before = nodeIds.length
      ? await tx.select().from(challengeRelation).where(inArray(challengeRelation.fromId, nodeIds))
      : [];
    if (nodeIds.length) await tx.delete(challengeRelation).where(inArray(challengeRelation.fromId, nodeIds));
    if (edges.length) await tx.insert(challengeRelation).values(edges.map((edge) => ({ fromId: edge.from, toId: edge.to })));
    await tx.update(challengeRelationOverride).set({ updatedBy: admin.id, updatedAt: new Date() }).where(eq(challengeRelationOverride.mapId, mapId));

    const label = (list: ChallengeRelation[]) => list.map((edge) => `${names.get(edge.from) ?? edge.from} → ${names.get(edge.to) ?? edge.to}`).sort().join("；") || "无从属关系";
    const lines = diffLines([["从属关系", label(before.map((row) => ({ from: row.fromId, to: row.toId }))), label(edges)]]);
    await writeAudit(tx, admin, "修改挑战逻辑关系", `地图 ${mapRow[0].name}\n${lines.join("\n") || "- 无实际变化"}`);
    return done(undefined);
  });
}

export async function liveChallengeOrder(tx: Tx, mapId: number) {
  const rows = await tx.select({ id: challenge.id }).from(challenge)
    .where(and(eq(challenge.mapId, mapId), eq(challenge.scope, "map"), isNull(challenge.deletedAt)))
    .orderBy(asc(challenge.sortOrder), asc(challenge.id));
  return rows.map((row) => row.id);
}

export async function resequenceChallenges(tx: Tx, ids: number[]) {
  for (const [index, id] of ids.entries()) await tx.update(challenge).set({ sortOrder: index }).where(eq(challenge.id, id));
}

export type SplitInput = { first?: SplitPart; second?: SplitPart; selected?: unknown };

export async function splitChallenge(admin: Admin, sourceId: number, input: SplitInput): Promise<Result<{ first: number; second: number }>> {
  const firstName = clean(input.first?.name, 300);
  const secondName = clean(input.second?.name, 300);
  if (!firstName || !secondName) return failure("请填写两个新挑战的名称。");
  const selected = new Set(idArray(input.selected, 5_000));
  return commandTransaction(async (tx) => {
    const rows = await tx.select().from(challenge).where(and(eq(challenge.id, sourceId), isNull(challenge.deletedAt))).limit(1);
    const source = rows[0];
    if (!source) return failure("挑战不存在或已删除。", 404);
    if (source.scope !== "map" || !source.mapId) return failure("只有地图挑战可以分割。");
    const sourceLabel = await challengeLabel(tx, sourceId);
    const mapId = source.mapId;
    const beforeOrder = await liveChallengeOrder(tx, mapId);

    const firstId = await nextEntityId("challenge", tx);
    const secondId = await nextEntityId("challenge", tx);
    await tx.insert(challenge).values([
      { id: firstId, scope: "map", mapId, name: firstName, type: source.type ?? "Other", tierCode: tierCode(input.first?.tier), notice: optional(input.first?.notice, 4_000), sortOrder: source.sortOrder },
      { id: secondId, scope: "map", mapId, name: secondName, type: source.type ?? "Other", tierCode: tierCode(input.second?.tier), notice: optional(input.second?.notice, 4_000), sortOrder: source.sortOrder },
    ]);

    // 记录是迁移不是复制：源挑战随后软删除，复制会让记录随源一起从投影里消失。
    const moving = await tx.select({ id: submission.id }).from(submission)
      .where(and(eq(submission.challengeId, sourceId), isNull(submission.deletedAt)));
    const toSecond = moving.map((row) => row.id).filter((id) => selected.has(id));
    const toFirst = moving.map((row) => row.id).filter((id) => !selected.has(id));
    if (toFirst.length) await tx.update(submission).set({ challengeId: firstId }).where(inArray(submission.id, toFirst));
    if (toSecond.length) await tx.update(submission).set({ challengeId: secondId }).where(inArray(submission.id, toSecond));
    // 已删除的记录一并改挂，避免恢复时指向一个被软删的挑战。
    await tx.update(submission).set({ challengeId: firstId }).where(eq(submission.challengeId, sourceId));

    const override = await tx.select().from(challengeRelationOverride).where(eq(challengeRelationOverride.mapId, mapId)).limit(1);
    if (override[0]) {
      const nodes = await tx.select({ id: challenge.id }).from(challenge)
        .where(and(eq(challenge.mapId, mapId), eq(challenge.scope, "map"), isNull(challenge.deletedAt)));
      const nodeIds = nodes.map((row) => row.id).filter((id) => id !== sourceId);
      const edges = await tx.select().from(challengeRelation).where(inArray(challengeRelation.fromId, nodes.map((row) => row.id)));
      const rewired = edges.flatMap<ChallengeRelation>((edge) => {
        if (edge.fromId === sourceId) return [{ from: firstId, to: edge.toId }, { from: secondId, to: edge.toId }];
        if (edge.toId === sourceId) return [{ from: edge.fromId, to: firstId }, { from: edge.fromId, to: secondId }];
        return [{ from: edge.fromId, to: edge.toId }];
      });
      await tx.delete(challengeRelation).where(inArray(challengeRelation.fromId, nodes.map((row) => row.id)));
      const kept = ensureDag(nodeIds, rewired);
      if (kept.length) await tx.insert(challengeRelation).values(kept.map((edge) => ({ fromId: edge.from, toId: edge.to }))).onConflictDoNothing();
    }

    await tx.update(challenge).set({ deletedAt: new Date() }).where(eq(challenge.id, sourceId));
    await tx.insert(trashItem).values({ kind: "challenge", targetId: sourceId, label: sourceLabel }).onConflictDoNothing();
    await resequenceChallenges(tx, beforeOrder.flatMap((id) => id === sourceId ? [firstId, secondId] : [id]));

    await writeAudit(tx, admin, "分割挑战",
      `${sourceLabel}\n- 拆为：${firstName}（${tierCode(input.first?.tier)}） / ${secondName}（${tierCode(input.second?.tier)}）`
      + `\n- 记录迁移：${toFirst.length} 条归前者，${toSecond.length} 条归后者\n- 源挑战已移入回收站`);
    return done({ first: firstId, second: secondId });
  });
}

export type MergeInput = { targetId?: unknown; label?: unknown; color?: unknown };

export async function mergeChallenge(admin: Admin, sourceId: number, input: MergeInput): Promise<Result> {
  const targetId = entityId(input.targetId);
  if (!targetId) return failure("请选择合并目标挑战。");
  if (targetId === sourceId) return failure("不能合并到挑战自身。");
  const tagText = clean(input.label, 200);
  const tagColor = optional(input.color, 32);
  return commandTransaction(async (tx) => {
    const sourceRows = await tx.select().from(challenge).where(and(eq(challenge.id, sourceId), isNull(challenge.deletedAt))).limit(1);
    const source = sourceRows[0];
    if (!source) return failure("源挑战不存在或已删除。", 404);
    const targetRows = await tx.select({ id: challenge.id }).from(challenge).where(and(eq(challenge.id, targetId), isNull(challenge.deletedAt))).limit(1);
    if (!targetRows[0]) return failure("目标挑战不存在或已删除。", 404);
    const sourceLabel = await challengeLabel(tx, sourceId);
    const targetLabel = await challengeLabel(tx, targetId);
    const beforeOrder = source.mapId ? await liveChallengeOrder(tx, source.mapId) : [];

    const moving = await tx.select({ id: submission.id }).from(submission).where(eq(submission.challengeId, sourceId));
    if (moving.length) await tx.update(submission).set({ challengeId: targetId }).where(eq(submission.challengeId, sourceId));
    if (tagText && moving.length) {
      await tx.insert(submissionTag).values(moving.map((row) => ({ submissionId: row.id, kind: "badge", text: tagText, color: tagColor })));
    }

    await tx.update(challenge).set({ deletedAt: new Date() }).where(eq(challenge.id, sourceId));
    await tx.insert(trashItem).values({ kind: "challenge", targetId: sourceId, label: sourceLabel }).onConflictDoNothing();
    await resequenceChallenges(tx, beforeOrder.filter((id) => id !== sourceId));

    await writeAudit(tx, admin, "合并挑战",
      `${sourceLabel} → ${targetLabel}\n- 记录迁移：${moving.length} 条`
      + `\n- 标签：${tagText || "无"}\n- 源挑战已移入回收站`);
    return done(undefined);
  });
}
