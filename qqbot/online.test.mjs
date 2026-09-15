import test from "node:test";
import assert from "node:assert/strict";
import { createOnlineCommand, formatOnlinePlayers, selectOnlinePlayers } from "./online.mjs";
import { createDispatcher } from "./commands.mjs";

const player = (overrides = {}) => ({ playerId: 1, playerName: "测试玩家", activity: "practice", mapId: 2, mapName: "Original Map", mapCnName: null, campaignId: 3, campaignName: "Original Pack", campaignCnName: null, challengeId: 4, challengeName: "[No DTS] [FC]", tier: "t7", ...overrides });

test("只显示练习/带金的正式 Tier 挑战，带金优先且按难度排序", () => {
  const excluded = [player({ activity: "clearing" }), player({ activity: "unknown" }), player({ tier: "standard" }), player({ tier: "undetermined" }), player({ tier: null }), player({ tier: "toString" }), player({ challengeId: null }), player({ mapId: null })];
  assert.deepEqual(selectOnlinePlayers(excluded), []);
  const selected = selectOnlinePlayers([player({ tier: "t7" }), player({ tier: "h0" }), player({ activity: "golden", tier: "t4" }), ...excluded]);
  assert.deepEqual(selected.map(p => [p.activity, p.tier]), [["golden", "t4"], ["practice", "h0"], ["practice", "t7"]]);
});

test("排版展示正式名称、地图包、Tier 和限定，空列表给出准确提示", () => {
  const [message] = formatOnlinePlayers([player({ mapCnName: "正式地图名", campaignCnName: "正式包名", tier: "m2" })]);
  assert.match(message, /🎯 练习 · 测试玩家/);
  assert.match(message, /正式包名 › 正式地图名/);
  assert.match(message, /Mid T2 · \[No DTS\] FC/);
  assert.doesNotMatch(message, /Original/);
  assert.match(formatOnlinePlayers([player()])[0], /Original Pack › Original Map/);
  assert.match(formatOnlinePlayers([])[0], /暂无正在练习或带金、且推测挑战上榜/);
});

test("长列表分页覆盖所有玩家，消息不超过上限，异常长名字也可发送", () => {
  const players = Array.from({ length: 80 }, (_, i) => player({ playerId: String(i), playerName: `玩家#${String(i).padStart(3, "0")}` }));
  const pages = formatOnlinePlayers(players, 400);
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => page.length <= 400));
  for (const p of players) assert.equal(pages.join("\n").split(p.playerName).length - 1, 1);
  assert.ok(formatOnlinePlayers([player({ mapName: "🍓".repeat(2000) })], 400).every(page => page.length <= 400));
});

test("读取公开接口，合并并发请求但不缓存旧状态，错误不误报空列表", async () => {
  let calls = 0;
  const command = createOnlineCommand({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:8268/api/online");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ players: [player()] }) };
  } });
  const [a, b] = await Promise.all([command(), command()]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await command();
  assert.equal(calls, 2);
  for (const fetchImpl of [async () => { throw new Error("timeout"); }, async () => ({ ok: false, status: 503 }), async () => ({ ok: true, json: async () => ({}) })]) {
    assert.match((await createOnlineCommand({ fetchImpl })())[0], /暂时无法获取/);
  }
});

test("/online 只在生效群执行，按顺序发送各页", async () => {
  const replies = [];
  const dispatch = createDispatcher({ config: { enabledGroups: ["200"] }, messages: { send: async (group, text) => replies.push([group, text]) }, commands: new Map([["/online", { run: async () => ["第一页", "第二页"] }]]) });
  const event = group => ({ post_type: "message", message_type: "group", group_id: group, user_id: 2, raw_message: "/online" });
  await dispatch(event(100));
  assert.equal(replies.length, 0);
  await dispatch(event(200));
  assert.deepEqual(replies, [["200", "第一页"], ["200", "第二页"]]);
});

test("图片默认只发一页，翻页不漏玩家，非法页码不渲染", async () => {
  const players = Array.from({ length: 23 }, (_, i) => player({ playerId: `${i}`, playerName: `玩家${String(i).padStart(2, "0")}` }));
  const seen = [];
  const command = createOnlineCommand({ fetchImpl: async () => ({ ok: true, json: async () => ({ players }) }),
    render: async (selected, page) => { seen.push(selected.slice((page - 1) * 10, page * 10)); return Buffer.from("png"); } });
  for (const rest of ["", "2", "3"]) {
    const reply = await command({ rest });
    assert.equal(reply.length, 1);
    assert.equal(reply[0].type, "image");
  }
  assert.deepEqual(seen.flat().map(p => p.playerId), selectOnlinePlayers(players).map(p => p.playerId));
  assert.match((await command({ rest: "4" }))[0], /共 3 页/);
  for (const rest of ["0", "-1", "1.5", "abc", "99999999999"]) assert.match((await command({ rest }))[0], /用法/);
  assert.equal(seen.length, 3);
});

test("渲染失败返回短提示，不自动刷出文字列表", async () => {
  const command = createOnlineCommand({ fetchImpl: async () => ({ ok: true, json: async () => ({ players: [player()] }) }), render: async () => { throw new Error("render failed"); } });
  assert.match((await command())[0], /图片暂时无法生成/);
});

test("图片回复经统一消息服务发送，保留群与分页参数", async () => {
  const sent = [], png = Buffer.from("png");
  const dispatch = createDispatcher({ config: { enabledGroups: ["200"] },
    messages: { send: () => assert.fail(), sendImage: async (...args) => sent.push(args) },
    commands: new Map([["/online", { run: async ({ rest }) => { assert.equal(rest, "2"); return [{ type: "image", png }]; } }]]) });
  await dispatch({ post_type: "message", message_type: "group", group_id: 200, user_id: 2, raw_message: "/online 2" });
  assert.deepEqual(sent, [["200", png]]);
});

test("SVG 转义用户文字，长内容有界且 favicon 同源，PNG 尺寸和缓存有界", async () => {
  const { onlineSvg, renderOnlineImage } = await import("./online-image.mjs");
  const svg = await onlineSvg([{ name: '<script>&"', golden: true, tier: "h0", map: "地图".repeat(3000), challenge: "[No DTS] FC" }], { golden: 1, total: 1, page: 1, pages: 1, updatedAt: "12:00:00" });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;&amp;&quot;/);
  assert.match(svg, /…/);
  assert.equal((svg.match(/xlink:href="data:image\/png;base64,/g) ?? []).length, 3);
  const players = Array.from({ length: 10 }, (_, i) => player({ playerId: `${i}`, playerName: "测试中文玩家", activity: i < 2 ? "golden" : "practice" }));
  const [a, b] = await Promise.all([renderOnlineImage(players), renderOnlineImage(players)]);
  assert.strictEqual(a, b);
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(a).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 900);
  assert.equal(metadata.height, 1530);
  assert.ok(a.length < 2 * 1024 * 1024);
});


test("真实字宽排版保留能放下的英文地图名，Tier 在标签中心对齐", async () => {
  const { onlineSvg } = await import("./online-image.mjs");
  const map = "7d(single dash ver) › 7D With Single Dash... (Old)";
  const svg = await onlineSvg([{ name: "测试", golden: false, tier: "t7", map, challenge: "FC" }],
    { golden: 0, total: 1, page: 1, pages: 1, updatedAt: "12:00:00" });
  assert.ok(svg.includes(map));
  assert.match(svg, /height="414"/);
  assert.match(svg, /x="781.5" y="226" text-anchor="middle" dominant-baseline="central"[^>]*>Tier 7/);
});


test("路线进度使用当前位置/总长度，没有有效路线时不显示，不泄漏房间名，位置变化使缓存失效", async () => {
  const { renderOnlineImage, onlineSvg } = await import("./online-image.mjs");
  const row = { name: "测试", golden: true, tier: "h0", map: "7d(single dash ver) › 7D With Single Dash... (Old)", challenge: "C", progress: { position: 3, length: 12 } };
  const svg = await onlineSvg([row], { golden: 1, total: 1, page: 1, pages: 1, updatedAt: "12:00:00" });
  assert.match(svg, /data-route-progress="3\/12"/);
  assert.match(svg, /width="35.75" height="6"/);
  assert.ok(svg.includes(row.map));
  const base = player({ room: "secret-room-name", position: null, routeLength: null });
  const without = await renderOnlineImage([base]);
  for (const fields of [{ position: null, routeLength: 12 }, { position: 3, routeLength: 0 }, { position: 13, routeLength: 12 }, { position: 0, routeLength: 12 }]) {
    assert.strictEqual(await renderOnlineImage([{ ...base, ...fields }]), without);
  }
  const first = await renderOnlineImage([{ ...base, position: 3, routeLength: 12 }]);
  const second = await renderOnlineImage([{ ...base, position: 4, routeLength: 12 }]);
  assert.notDeepEqual(first, without);
  assert.notDeepEqual(first, second);
  assert.strictEqual(await renderOnlineImage([{ ...base, room: "different-room", position: 4, routeLength: 12 }]), second);
});
