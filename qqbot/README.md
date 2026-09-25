# QQ 机器人

提供生效群内的 `/help`、`/ping`、`/online` 指令、带金房间提醒和服务端消息推送。
使用 OneBot v11 反向 WebSocket，NapCat 主动连接机器人。

## 配置与启动

配置只读取根目录 `config.json`，字段见 `config.example.json` 的 `qqbot`：

- `host`、`port`：WebSocket 监听地址，默认 `127.0.0.1:8269`。
- `accessToken`：NapCat 连接凭据，必填。
- `allowIps`：允许连接的来源 IP；对外监听时必填。
- `enabledGroups`：生效群号字符串数组；空数组关闭普通指令。
- `pingGroups`：Ping 点推送群号字符串数组，独立于 `enabledGroups`；向全部配置群推送，空数组关闭提醒。
- `onlineUrl`：本站公开在线接口，默认 `http://127.0.0.1:8268/api/online`。
- `apiToken`、`apiPort`：可选本机推送接口，token 必须与连接凭据不同。
- `replyLimit`：消息长度上限，默认 2000。

NapCat 配置 WebSocket 客户端，指向机器人的监听地址并填写相同 token。
跨公网连接应通过可信隧道或 TLS 代理保护；代理场景的来源 IP 为代理地址。

```bash
npm install
npm run qqbot
npm run test:qqbot
```

`GET /healthz` 返回 NapCat 连接状态。启动不要求配置运维账户。

## 业务行为

`/online` 读取本站公开在线数据，显示正式 Tier 或未决定挑战的练习或带金玩家，直播时在小字中显示直播间号；
`/online 2` 翻页，每页最多 10 人。复用共享 Tier、挑战显示名规则，
图片使用前端 tokens 与 favicon，通过 Sharp 渲染，不启动浏览器。

带金提醒使用 `database.url` 指定的同一 PostgreSQL 数据库，复用后端队列领取与
发送前权限检查，发到全部 `pingGroups`，无需同时启用群指令。断线不领取，过期事件不补发，
发送失败或回执未知不重试。QQ 用户 ID 不作为网站账户身份。

普通指令每群两秒限流；私聊、自身消息、未知指令和未启用群均忽略。
测试使用模拟连接与发送器，不连接真实 QQ。

## 服务端推送

配置 `apiToken` 后监听 `127.0.0.1:8270`（端口可配置）。
`POST /v1/messages` 使用 `Authorization: Bearer <apiToken>`：

```json
{"groupIds":["123456789"],"text":"通知内容"}
```

省略 groupIds 表示全部生效群。目标必须全部在白名单中；只接受文本。
HTTP 207 表示存在发送失败，调用方须检查逐群结果，未知回执不可自动重试。
凭据只能由服务端持有，网站调用仍须先验证管理员会话。

玩家实际收集金草莓或银草莓时（CNGoldenLink 0.3.0 起上报），同样发到 `pingGroups`：仅限该玩家在愿望单里为这张地图面设置过 Ping 点，
不显示房间与追加文本；Mod 的事件 ID 保证重试不重复推送。

玩家在 Mod 中选择了当前挑战时，房间提醒与草莓推送都只针对该挑战的 Ping 点（严格相等），其他挑战的 Ping 点不触发；
没有选择时房间提醒按 Ping 点各自推送，草莓推送把同面设了 Ping 点的挑战合并为一条（如 `C / FC`）。
`/online` 中明确选择的挑战显示为「挑战」，不再标为推测。

Ping 点推送的房间格式为 `房间：5 / 10 （room-key）`，位置取触发玩家设备最近同步的 CCT 路线，沿用分组与忽略房间规则；无可用路线或房间不在路线中时为 `房间：room-key`。

## 每日总结

`qqbot.dailySummaryGroups` 单独设置每日总结推送群；省略或空数组关闭，不继承
`enabledGroups` 或 `pingGroups`。`dailySummaryUrl` 默认读取本机
`http://127.0.0.1:8268/api/daily-summary`，消息详情链接使用 `server.origin`。

北京时间每日 22:30 汇总前一天 22:30（含）至当天 22:30（不含）的有效通过记录。
群内一次合并转发：日期标题、按难度从高到低的全部图片（每张至多 10 条，不含 Std）、
Std 条数及 `/daily-summary?date=YYYY-MM-DD` 链接。未定档仍展示；全 Std 时只有标题与尾句，
无记录时附空态文字。页面展示全部记录，包括 Std，不展开挑战 DAG 的继承成绩。

通过时间独立于人工审核和玩家达成日期，新增记录与状态转为 accepted 时由数据库维护。
旧数据按审核时间、其次创建时间回填；历史自动建档的真实通过时间无法完全还原。
总结读取当前有效记录，后续隐藏、回收或改名会影响历史页面，不保存公开内容快照。

任务每 5 秒检查时间；断线或接口准备失败在当晚午夜前补发，重启不补更早的旧总结。
发送前按日期和群号在 `daily_summary_delivery` 唯一领取；已领取、失败或回执未知均不自动重发，
避免服务重启造成重复群消息。准备失败每分钟重试；成功保存消息 ID，失败写日志。
