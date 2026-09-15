import { requestUrl, context, type ApiRequest } from "../../../plugins/http";
import { db } from "../../../db/client";
import { withDevice } from "../device-route";
import { loadOverlayContext, overlayScope } from "../overlay-context";

export async function GET(request: ApiRequest) {
  context().reply.header("Cache-Control", "private, no-store");
  return withDevice(request, async () => {
    const { sid, side } = overlayScope(requestUrl(request));
    return loadOverlayContext(db, sid, side);
  }, 1024);

}
