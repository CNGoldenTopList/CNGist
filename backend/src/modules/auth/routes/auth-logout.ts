import { jsonResponse } from "../../../plugins/http";
import { destroyCurrentSession } from "../session";

export async function POST() {
  await destroyCurrentSession();
  return jsonResponse({ ok: true });
}
