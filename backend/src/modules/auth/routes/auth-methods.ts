import { jsonResponse } from "../../../plugins/http";
import { availableProviders } from "../providers";
import { boundIdentities } from "../link";
import { currentSession } from "../session";

/** 登录方式清单。服务端组件可以直接调 availableProviders()， */
export async function GET() {
  const active = await currentSession();
  return jsonResponse({
    available: availableProviders(),
    bound: active ? await boundIdentities(active.accountId) : [],
  });
}
