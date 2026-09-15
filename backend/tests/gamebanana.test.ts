import { test } from "node:test";
import assert from "node:assert/strict";
import { validGameBananaUrl } from "../../shared/src/gamebanana";
import { createPlayerSubmission } from "../src/modules/records/submission-service";
test("new challenges reject absent links and non-map GameBanana URLs before writing", async () => {
  for (const gameBananaUrl of [undefined, "", "https://example.com/mods/12", "https://gamebanana.com/members/12", "https://gamebanana.com.evil.test/mods/12", "https://user@gamebanana.com/mods/12"]) {
    assert.equal(validGameBananaUrl(gameBananaUrl), false);
    const result = await createPlayerSubmission({ displayName: "test" }, 1, { kind: "challenge", videoUrl: "https://example.test/video", achievedAt: "2026-09-16", proposedTarget: { campaignName: "Pack", mapName: "Map", challengeName: "C", gameBananaUrl } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "gameBananaInvalid");
  }
  for (const value of ["https://gamebanana.com/mods/123", "https://www.gamebanana.com/wips/42/", " https://gamebanana.com/mods/123?x=y#Files "]) assert.equal(validGameBananaUrl(value), true);
});
