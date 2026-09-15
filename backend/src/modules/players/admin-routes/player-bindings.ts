import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { adminCommand } from "../../auth/admin-route";
import { acceptPlayerBindingCode } from "../../admin/admin-commands";
import { bindingArticleUrl } from "../player-binding-service";
import { appOrigin } from "../../auth/providers";
export async function POST(request: ApiRequest) {
  const origin = headerValue(request, "origin");
  if (origin && origin !== new URL(appOrigin()).origin) return jsonResponse({ ok: false, error: "请求来源无效。" }, { status: 403 });
  if (!headerValue(request, "content-type")?.includes("application/json")) return jsonResponse({ ok: false, error: "请求格式有误。" }, { status: 400 });
  if (!bindingArticleUrl()) return jsonResponse({ ok: false, error: "尚未配置绑定专栏 URL。" }, { status: 400 });
  return adminCommand(request, acceptPlayerBindingCode);
}
