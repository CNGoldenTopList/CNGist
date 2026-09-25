import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/client";
import { player } from "../../../db/schema/players";
import { jsonResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { loadReviewQueue } from "../../admin/admin-service";
import { submissionTokenOwner } from "../../auth/submission-token";
import { createAdminSubmission } from "../submission-service";

const fields = new Set(["playerId", "challengeId", "videoUrl", "achievedAt", "rawVideoUrl", "playerNote"]);
/** 每次打开录入表单前验证凭据；不读取任何业务记录。 */
export async function CHECK(request: ApiRequest) {
  const owner = await submissionTokenOwner(request.headers.authorization);
  return owner ? jsonResponse({ ok: true })
    : jsonResponse({ ok: false, error: "补录授权无效、已过期或已撤销，请重新授权。" }, { status: 401 });
}
/** 与原管理员队列共用筛选逻辑，仅返回所选玩家重复检查所需的字段。 */
export async function GET(request: ApiRequest) {
  const owner = await submissionTokenOwner(request.headers.authorization);
  if (!owner) return jsonResponse({ ok: false, error: "补录授权无效、已过期或已撤销，请重新授权。" }, { status: 401 });
  const value = requestUrl(request).searchParams.get("playerId") ?? "";
  const playerId = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(playerId) || playerId > 2147483647) {
    return jsonResponse({ ok: false, error: "玩家编号无效。" }, { status: 400 });
  }
  const records = (await loadReviewQueue()).filter(record => record.playerId === playerId)
    .map(({ id, playerId, challengeId, videoUrl, achievedAt, status }) => ({ id, playerId, challengeId, videoUrl, achievedAt, status }));
  return jsonResponse({ ok: true, data: records });
}

export async function POST(request: ApiRequest) {
  const owner = await submissionTokenOwner(request.headers.authorization);
  if (!owner) return jsonResponse({ ok: false, error: "补录授权无效、已过期或已撤销，请重新授权。" }, { status: 401 });
  const body = request.body;
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !fields.has(key))
    || ![body.playerId, body.challengeId].every(id => Number.isInteger(id) && Number(id) > 0 && Number(id) <= 2147483647)
    || typeof body.videoUrl !== "string" || body.videoUrl.length > 2000
    || typeof body.achievedAt !== "string" || body.achievedAt.length !== 10
    || (body.rawVideoUrl !== undefined && (typeof body.rawVideoUrl !== "string" || body.rawVideoUrl.length > 2000))
    || (body.playerNote !== undefined && (typeof body.playerNote !== "string" || body.playerNote.length > 4000))) {
    return jsonResponse({ ok: false, error: "仅支持为一个玩家的已有挑战补录单条成绩，参数无效。" }, { status: 400 });
  }
  const [target] = await db.select({ status: player.status }).from(player)
    .where(and(eq(player.id, body.playerId as number), isNull(player.deletedAt))).limit(1);
  if (!target) return jsonResponse({ ok: false, error: "玩家不存在。" }, { status: 404 });
  const result = await createAdminSubmission(owner, {
    playerId: body.playerId as number, challengeId: body.challengeId as number,
    videoUrl: body.videoUrl, achievedAt: body.achievedAt,
    rawVideoUrl: body.rawVideoUrl as string | undefined, playerNote: body.playerNote as string | undefined,
    status: target.status === "unwilling" ? "rejected" : "pending",
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status });
  const { id, playerId, challengeId, videoUrl, achievedAt, status } = result.data;
  return jsonResponse({ ok: true, record: { id, playerId, challengeId, videoUrl, achievedAt, status } }, { status: 201 });
}
