import { type ApiRequest } from "../../../plugins/http";
import { trackerCct } from "../tracker-cct-service";
import { withDevice } from "../device-route";

/** 读回本设备某个作用域的当前状态与游标。断线重连后用它对齐， */
export async function POST(request: ApiRequest) {
  return withDevice(request, async (principal, body) => ({
    current: await trackerCct.read(principal, body.scope),
  }));
}
