import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { isAdminRole } from "../../../../../shared/src/account-roles";
import { eq } from "drizzle-orm";
import { currentAccount } from "../../auth/session";
import { db } from "../../../db/client";
import { submission } from "../../../db/schema/index";
import { updateSubmission } from "../submission-service";
import { fail } from "../../../../../shared/src/api-errors";

export async function PATCH(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInActive"), { status: 401 });
  const id = pathEntityId(request.params.id);
  const rows = await db.select({ playerId: submission.playerId }).from(submission).where(eq(submission.id, id)).limit(1);
  if (!rows[0]) return jsonResponse(fail("recordMissing"), { status: 404 });
  if (!isAdminRole(owner.role) && (!owner.claimedPlayerId || owner.claimedPlayerId !== rows[0].playerId)) return jsonResponse(fail("recordForbidden"), { status: 403 });
  const body = await Promise.resolve(request.body).catch(() => null) as { recommends?: boolean | null; opinionTier?: string | null } | null;
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await updateSubmission({ id: owner.id, displayName: owner.displayName }, id, { recommends: body.recommends, opinionTier: body.opinionTier });
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, record: result.data });
}
