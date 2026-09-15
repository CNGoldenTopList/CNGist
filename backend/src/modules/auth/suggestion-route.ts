import { jsonResponse, headerValue, type ApiRequest } from "../../plugins/http";
import { currentAccount } from "./session";
import { suggestionCommand } from "../suggestions/suggestion-service";
import { fail } from "../../../../shared/src/api-errors";
import { appOrigin } from "./providers";
export async function writeSuggestion(request: ApiRequest, id?: number) {
  const origin = headerValue(request, "origin");
  if (origin && origin !== new URL(appOrigin()).origin) return jsonResponse(fail("badOrigin"), { status: 403 });
  const owner = await currentAccount();
  if (!owner || owner.status !== "active") return jsonResponse(fail("signInRequired"), { status: 401 });
  const body = await Promise.resolve(request.body).catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse(fail("requestMalformed"), { status: 400 });
  const result = await suggestionCommand(owner.id, body, id);
  return jsonResponse(result, { status: result.ok ? (id ? 200 : 201) : result.status });
}
