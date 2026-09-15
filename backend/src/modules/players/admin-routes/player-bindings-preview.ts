import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { appOrigin } from "../../auth/providers";
import { requireAdmin } from "../../auth/admin-route";
import { playerBindings } from "../../auth/player-binding";
import { bindingArticleUrl } from "../player-binding-service";

export async function GET() {
  if (!await requireAdmin()) return jsonResponse({ ok: false }, { status: 403 });
  return jsonResponse({ ok: true, articleUrl: bindingArticleUrl() }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: ApiRequest) {
  const origin = headerValue(request, "origin");
  if (origin && origin !== new URL(appOrigin()).origin) return jsonResponse({ ok: false, error: "请求来源无效。" }, { status: 403 });
  if (!headerValue(request, "content-type")?.includes("application/json")) return jsonResponse({ ok: false, error: "请求格式有误。" }, { status: 400 });
  if (!await requireAdmin()) return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const body = await Promise.resolve(request.body).catch(() => null);
  const result = await playerBindings.preview(body?.code);
  return jsonResponse(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "private, no-store" } });
}
