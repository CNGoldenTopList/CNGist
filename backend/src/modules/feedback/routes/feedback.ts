import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { currentAccount } from "../../auth/session";
import { createFeedbackReport } from "../feedback-service";
import { fail } from "../../../../../shared/src/api-errors";

export async function POST(request: ApiRequest) {
  const owner = await currentAccount();
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await createFeedbackReport(body, owner && owner.status === "active" ? { id: owner.id, displayName: owner.displayName } : null);
  if (!result.ok) return jsonResponse(result, { status: result.status });
  return jsonResponse({ ok: true, report: result.data }, { status: 201 });
}
