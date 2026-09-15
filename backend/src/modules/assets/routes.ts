import { requireAdmin } from "../auth/admin-route";
import { jsonResponse, type ApiRequest } from "../../plugins/http";
import { storeImage } from "./service";
export async function POST(request: ApiRequest) {
  if (!await requireAdmin()) return jsonResponse({ ok: false, error: "没有管理权限。" }, { status: 403 });
  const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  if (!file || file.fieldname !== "file") return jsonResponse({ ok: false, error: "需要 file 图片字段。" }, { status: 400 });
  const bytes = await file.toBuffer();
  const asset = await storeImage(bytes, "catalog");
  return jsonResponse({ ok: true, data: { objectKey: asset.key, url: asset.url, contentType: asset.contentType, bytes: asset.bytes } }, { status: 201 });
}
