/** 管理员批量创建或部分修改目录；整批共用事务。 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { campaign, map, challenge, imageAsset } from "../../db/schema";
import { writeAudit, type Tx } from "../admin/audit";
import type { Admin } from "../admin/admin-commands";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import { requiredEntityId } from "../../../../shared/src/entity-id";
import { parseMapHist } from "../../../../shared/src/hist";
type Kind = "campaign" | "map" | "challenge";
type Outcome = { index: number; kind: Kind; action: "create" | "update"; id: number; ref?: string };
class Preview extends Error { constructor(readonly results: Outcome[]) { super("preview"); } }
function invalid(message: string): never { throw Object.assign(new Error(message), { statusCode: 400 }); }
function text(value: unknown, max: number, nullable = false): string | null {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid("文本字段无效");
  return value.trim();
}
function fields(kind: Kind, data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  const allowed = kind === "campaign" ? ["name", "cnName", "aliases", "banner", "publicationUrl", "notice", "author", "description"] : kind === "map" ? ["name", "cnName", "aliases", "banner", "notice", "campaignId", "histRating", "author", "description"] : ["name", "tier", "notice", "description", "type", "scope", "mapId", "campaignId"];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) invalid(`不支持的字段：${key}`);
  for (const key of ["name", "cnName", "author", "description", "notice", "banner", "publicationUrl"]) {
    if (!(key in data)) continue;
    const value = text(data[key], ["description", "notice"].includes(key) ? 4000 : key === "publicationUrl" ? 2000 : 500, key !== "name");
    const target = key === "publicationUrl" ? "gameBananaUrl" : kind === "campaign" && key === "description" ? "blurb" : key;
    if (key === "publicationUrl" && value) {
      try { if (!["https:", "http:"].includes(new URL(value).protocol)) invalid("发布链接无效"); } catch { invalid("发布链接无效"); }
    }
    result[target] = key === "author" || key === "description" ? value ?? "" : value;
    if (key === "name" && kind === "campaign") result.shortName = value;
  }
  if ("aliases" in data) {
    if (!Array.isArray(data.aliases) || data.aliases.length > 100) invalid("别名数组无效");
    result.searchAliases = [...new Set(data.aliases.map(v => text(v, 300)))];
  }
  if ("tier" in data) { if (data.tier !== null && (typeof data.tier !== "string" || !isDifficultyCode(data.tier))) invalid("Tier 无效"); result.tierCode = data.tier; }
  if ("type" in data) { if (!["C", "FC", "C/FC", "All Major Secrets", "Silver Segment", "Other"].includes(String(data.type))) invalid("挑战类型无效"); result.type = data.type; }
  if ("histRating" in data) { const value = parseMapHist(data.histRating); if (!value) invalid("Hist 等级无效"); Object.assign(result, value); }
  return result;
}
async function targetExists(tx: Tx, kind: "campaign" | "map", id: number) {
  const table = kind === "campaign" ? campaign : map;
  const [row] = await tx.select({ id: table.id }).from(table).where(and(eq(table.id, id), isNull(table.deletedAt))).for("share");
  if (!row) invalid("从属地图或地图包不存在或已回收");
  if (kind === "map") { const [m] = await tx.select().from(map).where(eq(map.id, id)); await targetExists(tx, "campaign", m.campaignId); }
}
export async function batchCatalog(admin: Admin, body: Record<string, unknown>) {
  if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 200) invalid("operations 需要 1–200 项");
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") invalid("dryRun 必须是布尔值");
  const dryRun = body.dryRun !== false;
  const operations = body.operations;
  try {
    const results = await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE campaign, map, challenge IN SHARE ROW EXCLUSIVE MODE`);
      const refs = new Map<string, { kind: Kind; id: number }>();
      const results: Outcome[] = [];
      const resolve = (value: unknown, kind: Kind) => {
        if (typeof value === "string" && value.startsWith("$")) { const found = refs.get(value.slice(1)); if (!found || found.kind !== kind) invalid("引用不存在或类型不符"); return found.id; }
        return requiredEntityId(value);
      };
      for (const [index, raw] of operations.entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("操作格式无效");
        const op = raw as Record<string, unknown>;
        if (!["campaign", "map", "challenge"].includes(String(op.kind)) || !["create", "update"].includes(String(op.action))) invalid("操作类型无效");
        if (!op.data || typeof op.data !== "object" || Array.isArray(op.data)) invalid("缺少 data 对象");
        const kind = op.kind as Kind, action = op.action as "create" | "update";
        const data = op.data as Record<string, unknown>;
        const values = fields(kind, data);
        if (typeof values.banner === "string") {
          const [asset] = await tx.select({ id: imageAsset.id }).from(imageAsset).where(eq(imageAsset.objectKey, values.banner));
          if (!asset) invalid("封面图片索引不存在，请先上传图片");
        }
        const table = kind === "campaign" ? campaign : kind === "map" ? map : challenge;
        let before: Record<string, unknown> | undefined;
        let id: number;
        if (action === "update") {
          id = resolve(op.id, kind);
          [before] = await tx.select().from(table).where(and(eq(table.id, id), isNull(table.deletedAt))).for("update");
          if (!before) invalid("修改目标不存在或已回收");
        } else { if (!values.name) invalid("新建条目必须提供 name"); id = 0; }
        if (kind === "map") {
          const campaignId = "campaignId" in data ? resolve(data.campaignId, "campaign") : before?.campaignId as number;
          await targetExists(tx, "campaign", campaignId);
          if (before && campaignId !== before.campaignId) invalid("批量接口不支持跨包移动地图");
          values.campaignId = campaignId;
        }
        if (kind === "challenge") {
          const scope = data.scope ?? before?.scope;
          if (scope !== "map" && scope !== "campaign") invalid("挑战必须明确 scope");
          if (before && scope !== before.scope) invalid("不能变更挑战作用域");
          const key = scope === "map" ? "mapId" : "campaignId", other = scope === "map" ? "campaignId" : "mapId";
          if (data[other] !== undefined && data[other] !== null) invalid("挑战父级必须互斥");
          const parent = key in data ? resolve(data[key], scope) : before?.[key] as number;
          await targetExists(tx, scope, parent);
          if (before && parent !== before[key]) invalid("批量接口不支持移动已有挑战");
          Object.assign(values, { scope, [key]: parent, [other]: null });
          if (action === "create") { values.type ??= "Other"; values.tierCode = values.tierCode === undefined ? "undetermined" : values.tierCode; }
        }
        if (action === "create") {
          const [created] = kind === "campaign" ? await tx.insert(campaign).values(values as typeof campaign.$inferInsert).returning({ id: campaign.id }) : kind === "map" ? await tx.insert(map).values(values as typeof map.$inferInsert).returning({ id: map.id }) : await tx.insert(challenge).values(values as typeof challenge.$inferInsert).returning({ id: challenge.id });
          id = created.id;
        } else if (Object.keys(values).length) { await tx.update(table).set(values).where(eq(table.id, id)); }
        let ref: string | undefined;
        if (op.ref !== undefined) { ref = text(op.ref, 100)!; if (!/^[a-zA-Z0-9_-]+$/.test(ref) || refs.has(ref)) invalid("ref 无效或重复"); refs.set(ref, { kind, id }); }
        await writeAudit(tx, admin, action === "create" ? "批量新建目录条目" : "批量修改目录条目", `${kind} #${id}
${JSON.stringify({ before: before ?? null, after: values })}`);
        results.push({ index, kind, action, id, ...(ref ? { ref } : {}) });
      }
      if (dryRun) throw new Preview(results);
      return results;
    });
    return { ok: true as const, data: { dryRun: false, results } };
  } catch (error) { if (error instanceof Preview) return { ok: true as const, data: { dryRun: true, results: error.results } }; throw error; }
}
