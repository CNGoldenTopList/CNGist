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

## 新挑战审核

`goldberries-review.mjs` 提供 `/审核新挑战` 正式执行入口；
`/审核新挑战 dry-run` 只读预演，不建档、不审核、不上传。
宿主须显式提供管理员鉴权与回复出口；普通业务分发器不会自动开放该指令。
本机由私有入口校验管理员 QQ 与管理员群同时匹配，写库前再次校验权限。

只处理 pending 且尚未关联挑战的新提案，用 GameBanana 链接、地图名、目标与
挑战类型匹配 goldberries；Tier 1/2/3 映射 low/mid/high-std。
C/FC 按来源保留，FC 提案添加 FC 标签；Golden Berry 与 Silver Berry 都可匹配。
地图包级挑战、附加限定、重名、回收冲突及超过范围的难度保留待人工处理。

正式执行下载并校验来源封面，上传至配置的 OSS；来源明确缺少地图封面时复用
地图包封面。目录建档、封面索引、记录关联与审计在单条提案的事务中完成。
成功记录按 Std 规则自动通过，审核者和审核时间留空，不表示人工验片。
已有目录可复用，已有封面保留；写库前复查提案内容、状态及目录冲突。

回复逐项列出新建/复用、难度、封面处理和跳过原因，每处理十条发送进度。
同一时刻只允许一个导入任务；重复执行只扫描剩余提案。
单项失败不会阻止其他提案，上传失败会清理本次已上传的对象；数据库提交结果
不明时保留图片并提示核对。逐项日志保存在忽略的 `qqbot/logs/goldberries/`。
