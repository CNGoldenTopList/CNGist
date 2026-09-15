import { requiredEntityId } from "../../../../../shared/src/entity-id";
import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, requestUrl, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import {
  addWishlistEntry, listWishlistForAccount, listWishlistForPlayer,
  removeWishlistByChallenge, removeWishlistEntry, updateWishlistEntry,
} from "../wishlist-service";
import { fail } from "../../../../../shared/src/api-errors";

async function activeAccount() {
  const owner = await currentAccount();
  return owner?.status === "active" ? owner : null;
}

export async function GET(request: ApiRequest) {
  const playerId = requestUrl(request).searchParams.get("playerId")?.trim();
  if (playerId) {
    return jsonResponse({ ok: true, entries: await listWishlistForPlayer(pathEntityId(playerId)) });
  }
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  return jsonResponse({ ok: true, entries: await listWishlistForAccount(owner.id) });
}

export async function POST(request: ApiRequest) {
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await addWishlistEntry(owner.id, (body as { challengeId?: unknown }).challengeId);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, entry: result.data }, { status: 201 });
}

export async function PATCH(request: ApiRequest) {
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  const body = await Promise.resolve(request.body).catch(() => null) as {
    id?: unknown; status?: unknown; progress?: unknown; bestDeaths?: unknown;
    comment?: unknown; practiceDuration?: unknown;
  } | null;
  const id = body?.id;
  if (!body || !id) return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await updateWishlistEntry(owner.id, requiredEntityId(id), {
    status: body.status === "active" || body.status === "soon" || body.status === "later" || body.status === "archive"
      ? body.status
      : undefined,
    progress: typeof body.progress === "number" ? body.progress : undefined,
    bestDeaths: body.bestDeaths === null || body.bestDeaths === undefined || body.bestDeaths === ""
      ? body.bestDeaths === undefined ? undefined : null
      : Number(body.bestDeaths),
    comment: typeof body.comment === "string" ? body.comment : undefined,
    practiceDuration: typeof body.practiceDuration === "string" ? body.practiceDuration : undefined,
  });
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, entry: result.data });
}

export async function DELETE(request: ApiRequest) {
  const owner = await activeAccount();
  if (!owner) return jsonResponse(fail("signInRequired"), { status: 401 });
  const url = requestUrl(request);
  const challengeId = url.searchParams.get("challengeId");
  const id = url.searchParams.get("id");
  if (challengeId) {
    const result = await removeWishlistByChallenge(owner.id, pathEntityId(challengeId));
    if (!result.ok) return jsonResponse(result, { status: result.status });
    return jsonResponse({ ok: true, removed: result.data.removed });
  }
  if (!id) return jsonResponse(fail("wishlistMissingTarget"), { status: 400 });
  const result = await removeWishlistEntry(owner.id, pathEntityId(id));
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true });
}
