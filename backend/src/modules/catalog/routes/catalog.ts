import { jsonResponse } from "../../../plugins/http";
import { loadCatalog } from "../data";

/** 公开目录及有效记录；管理数据使用独立鉴权接口。 */
export async function GET() {
  const data = await loadCatalog();
  return jsonResponse(data);
}
