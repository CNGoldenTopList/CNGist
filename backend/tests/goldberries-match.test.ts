import assert from "node:assert/strict";
import { test } from "node:test";
import { matchGoldberries } from "../src/modules/records/goldberries-match";
const proposal = { campaignName: "Pack", mapName: "Map", challengeName: "FC" };
const link = "https://gamebanana.com/mods/123";
const challenge = { id: 3, map_id: 2, campaign_id: null, has_fc: true, objective: { name: "Silver Berry" }, difficulty: { name: "Tier 2", sort: 2 } };
function match(p = proposal, overrides = {}, extra: object[] = []) {
  return matchGoldberries(1, p, [{ id: 1, name: "Pack", url: link, challenges: [], maps: [{ id: 2, campaign_id: 1, name: "Map", challenges: [{ ...challenge, ...overrides }, ...extra] }] }], link);
}
test("缓存匹配严格保留 C/FC、命名目标、规则和 Standard 映射", () => {
  const result = match();
  assert.equal(result.targetType, "C/FC"); assert.equal(result.tier, "mid-std"); assert.equal(result.addFcTag, true);
  assert.equal(match(proposal, { difficulty: { name: "Untiered", sort: 0 } }).tier, "low-std");
  const named = match({ ...proposal, challengeName: "All Major Secrets [FC]" }, { objective: { name: "All Major Secrets" } });
  assert.equal(named.targetChallengeName, "All Major Secrets [FC]");
  for (const overrides of [
    { label: "No DTS" }, { description: "extra rule" }, { campaign_id: 1 }, { is_rejected: true },
    { objective: { name: "All Major Secrets" } },

  ]) assert.throws(() => match(proposal, overrides));
  for (const difficulty of [{name:"Undetermined",sort:-1},{name:"Tier 4",sort:4},{name:"Tier 2",sort:1}]) { const partial=match(proposal,{difficulty}); assert.equal(partial.tier,null); assert.ok(partial.sourceUrl); }
  assert.throws(() => match(proposal, {}, [{ ...challenge, id: 4 }]), /唯一匹配/);
  assert.throws(() => match({ ...proposal, mapName: "Different" }), /地图名/);
  assert.throws(() => matchGoldberries(1, proposal, [], link), /地图包/);
});
