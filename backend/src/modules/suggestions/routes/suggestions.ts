import { type ApiRequest } from "../../../plugins/http";
import { writeSuggestion } from "../../auth/suggestion-route";

export async function POST(request: ApiRequest) { return writeSuggestion(request); }
