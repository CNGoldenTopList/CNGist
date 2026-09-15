import { type ApiRequest } from "../../../plugins/http";
import { trackerCct } from "../tracker-cct-service";
import { withDevice } from "../device-route";

/** 安装一份完整状态。首次 expected 为 null，覆盖必须带上当前完整游标。 */
export async function POST(request: ApiRequest) {
  return withDevice(request, (principal, body) => trackerCct.baseline(principal, {
    scope: body.scope,
    mutationId: body.mutationId as string,
    streamEpoch: body.streamEpoch as string,
    revision: body.revision as number,
    expected: (body.expected ?? null) as never,
    state: body.state,
  }));
}
