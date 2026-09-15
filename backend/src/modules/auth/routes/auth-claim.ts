import { jsonResponse, headerValue, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../session";
import { toSessionAccount } from "../accounts";
import { playerBindings } from "../player-binding";
import { bindingArticleUrl } from "../../players/player-binding-service";
import { appOrigin } from "../providers";
import { fail } from "../../../../../shared/src/api-errors";

const json = (body: unknown, status = 200) => jsonResponse(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return json(fail("signInRequired"), 401);
  return json({ ok: true, binding: await playerBindings.current(owner.id), articleUrl: bindingArticleUrl(), account: toSessionAccount(owner) });
}
export async function POST(request: ApiRequest) {
  const origin = headerValue(request, "origin");
  if (origin && origin !== new URL(appOrigin()).origin) return json(fail("badOrigin"), 403);
  if (!headerValue(request, "content-type")?.includes("application/json")) return json(fail("requestMalformed"), 400);
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return json(fail("signInRequired"), 401);
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(fail("requestMalformed"), 400);
  if (body.action === "cancel") {
    await playerBindings.cancel(owner.id);
    return json({ ok: true, binding: null });
  }
  if (body.action === "verify") {
    const result = await playerBindings.verify(owner.id);
    if (!result.ok) return json({ ...result, binding: await playerBindings.current(owner.id) }, result.code === "bindingThrottled" || result.code === "bindingWait" ? 429 : 400);
    return json({ ok: true, account: toSessionAccount(result.data), binding: null });
  }
  if (body.action !== "begin") return json(fail("bindingRequired"), 400);
  const result = await playerBindings.begin(owner.id, { uid: body.uid, playerId: body.playerId });
  return result.ok ? json({ ok: true, binding: result.data, articleUrl: bindingArticleUrl() }) : json(result, result.code === "bindingThrottled" ? 429 : 400);
}
