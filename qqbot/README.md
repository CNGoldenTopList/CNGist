# QQ 机器人

提供生效群内的 `/help`、`/ping`、`/online` 指令、带金房间提醒和服务端消息推送。
使用 OneBot v11 反向 WebSocket，NapCat 主动连接机器人。

## 配置与启动

配置只读取根目录 `config.json`，字段见 `config.example.json` 的 `qqbot`：

- `host`、`port`：WebSocket 监听地址，默认 `127.0.0.1:8269`。
- `accessToken`：NapCat 连接凭据，必填。
- `allowIps`：允许连接的来源 IP；对外监听时必填。
- `enabledGroups`：生效群号字符串数组；空数组关闭普通指令与通知。
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

`/online` 读取本站公开在线数据，仅显示正式 Tier 的练习或带金玩家；
`/online 2` 翻页，每页最多 10 人。复用共享 Tier、挑战显示名规则，
图片使用前端 tokens 与 favicon，通过 Sharp 渲染，不启动浏览器。

带金提醒使用 `database.url` 指定的同一 PostgreSQL 数据库，复用后端队列领取与
发送前权限检查，只发到 `enabledGroups` 第一项。断线不领取，过期事件不补发，
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
