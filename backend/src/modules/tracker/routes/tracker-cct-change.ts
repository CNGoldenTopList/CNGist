import { type ApiRequest } from "../../../plugins/http";
import { trackerCct } from "../tracker-cct-service";
import { withDevice } from "../device-route";

/** 增量变更。revision 必须是当前 +1，服务端算出的 hash 对不上整笔回滚。 */
export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => trackerCct.change(principal, {
    scope: body.scope,
    mutationId: body.mutationId as string,
    expected: body.expected as never,
    revision: body.revision as number,
    patch: body.patch,
    afterStateHash: body.afterStateHash as string,
  }));
}
