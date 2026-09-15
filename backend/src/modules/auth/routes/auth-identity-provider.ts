import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { authIdentity } from "../../../db/schema/index";
import { currentSession } from "../session";
import { fail } from "../../../../../shared/src/api-errors";

/** 解绑一种登录方式。必须至少留下一种，否则账户会变成谁也进不去。 */
export async function DELETE(request: ApiRequest) {
  const active = await currentSession();
  if (!active) return jsonResponse(fail("signInRequired"), { status: 401 });

  const { provider } = request.params;
  const rows = await db.select({ id: authIdentity.id, provider: authIdentity.provider })
    .from(authIdentity).where(eq(authIdentity.accountId, active.accountId));

  if (rows.length <= 1) return jsonResponse(fail("identityLast"), { status: 400 });
  if (!rows.some((row) => row.provider === provider)) return jsonResponse(fail("identityMissing"), { status: 404 });

  await db.delete(authIdentity).where(and(eq(authIdentity.accountId, active.accountId), eq(authIdentity.provider, provider)));
  return jsonResponse({ ok: true });
}
