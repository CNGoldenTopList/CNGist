import { jsonResponse, type ApiRequest } from "../../../plugins/http";
import { sharedRoutes } from "../shared-route-service";
import { CctError } from "../cct-state";
import { httpStatusForCct } from "../cct-http";
export async function GET(request: ApiRequest) {
  try { return jsonResponse({ ok:true,...await sharedRoutes.read(request.params.id) }); }
  catch(error) {
    if(error instanceof CctError) return jsonResponse({ok:false,error:error.code},{status:httpStatusForCct(error.code)});
    console.error("[shared-routes]",error); return jsonResponse({ok:false,error:"server_error"},{status:500});
  }
}
