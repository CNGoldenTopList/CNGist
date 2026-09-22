import { entityId } from "../../../../../shared/src/entity-id";
import { fail } from "../../../../../shared/src/api-errors";
import { pool } from "../../../db/client";
import { jsonResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { PingError, readWishlistPing, saveWishlistPing } from "../wishlist-ping";

async function handle(request: ApiRequest, save: boolean) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const sql = await pool.connect();
  try {
    if (!save) {
      const id = entityId(Number(requestUrl(request).searchParams.get("wishId")));
      if (!id) throw new PingError("invalid");
      return jsonResponse({ ok: true, ...await readWishlistPing(sql, owner.id, id) });
    }
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PingError("invalid");
    await sql.query("BEGIN");
    await saveWishlistPing(sql, owner.id, body as Record<string, unknown>);
    await sql.query("COMMIT");
    return jsonResponse({ ok: true });
  } catch (error) {
    if (save) await sql.query("ROLLBACK");
    if (error instanceof PingError) return jsonResponse({ ok: false, pingError: error.reason }, { status: error.status });
    throw error;
  } finally { sql.release(); }
}
export const GET = (request: ApiRequest) => handle(request, false);
export const POST = (request: ApiRequest) => handle(request, true);
