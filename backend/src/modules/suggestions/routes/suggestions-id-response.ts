import { pathEntityId } from "../../../../../shared/src/entity-id";
import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { and, eq } from "drizzle-orm";
import { currentAccount } from "../../auth/session";
import { db } from "../../../db/client";
import { suggestionResponse } from "../../../db/schema/index";
import { fail } from "../../../../../shared/src/api-errors";
import { writeSuggestion } from "../../auth/suggestion-route";

export async function POST(request: ApiRequest) {
  return writeSuggestion(request, pathEntityId(request.params.id));
}
export async function GET(request: ApiRequest) {
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const id = pathEntityId(request.params.id);
  const [row] = await db.select({ vote: suggestionResponse.vote, comment: suggestionResponse.comment }).from(suggestionResponse)
    .where(and(eq(suggestionResponse.suggestionId, id), eq(suggestionResponse.accountId, owner.id)));
  return jsonResponse({ ok: true, data: { vote: row?.vote ?? "NONE", comment: row?.comment ?? "" } });
}
