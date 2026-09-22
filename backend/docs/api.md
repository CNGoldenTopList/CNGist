# CN 金榜 API 文档

公开查询、网站用户操作、本人设备同步和管理员接口。本文对应独立 Fastify 后端；文中账户页、设备确认页等页面路径由后续 Vue 前端实现。接口尚未统一版本化；响应可能增加字段，客户端应忽略不认识的字段。

## ID 约定

所有业务实体 ID（含账户、提交、附件、设备管理条目）均为正整数，JSON 使用 number，不能传数字字符串或旧 UUID。路径中的 ID 使用十进制表示。Tier code、B 站 UID、游戏 SID 和令牌仍为字符串。设备配置及授权兑换响应中的 `deviceId` 是兼容 Mod 的对外 UUID，与设备管理列表中的数字 `id` 不同；dataset/epoch/connection/mutation 等协议 UUID 保留。

## 请求与认证

所有路径均相对于当前站点域名。`/api/reference.md` 返回本文 Markdown，具体接口见下文。除文件上传外，有请求体的接口使用 JSON，并发送 `Content-Type: application/json`。路径中的 `{id}` 是占位符，需替换为真实 ID 并进行 URL 编码；ID 应从目录或创建响应取得，不要用名称代替。

| 权限范围 | 凭据 | 可用范围 |
| --- | --- | --- |
| 公开 | 无 | 公开目录、在线摘要、玩家头像、公开愿望单、匿名文字反馈等 |
| 用户会话 | `cngist_session` Cookie | 本人账户、提交、愿望单、意见、设备管理和私有统计 |
| 设备 | `Authorization: Bearer <accessToken>` | 已授权设备的配置、统计同步、实时状态写入和 Overlay 资料 |

这里的「用户 scope」表示服务端根据会话确定的本人权限，不是可传入的 OAuth scope 字符串。当前没有通用个人 API Key。设备 token 不能替代网站 Cookie 调用用户接口，也不能通过请求体中的 `accountId`、`playerId` 或 `deviceId` 指定操作者。

注册或密码登录成功后，服务端通过 `Set-Cookie` 写入 HttpOnly、SameSite=Lax 会话 Cookie，有效期 30 天；HTTPS 站点还设置 Secure。浏览器同源请求自动携带 Cookie。用户写入应从本站发起；所有写接口检查 Origin 或跨站请求标记，当前未提供跨站浏览器 CORS 接入协议。

```js
// 在本站页面、已登录的浏览器中运行
const response = await fetch('/api/wishlist', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challengeId: 123 }), // 用目录返回的数字 ID 替换
});
const result = await response.json();
if (!response.ok || result.ok === false) {
  throw new Error(result.error ?? `HTTP ${response.status}`);
}
console.log(result.entry);
```

## 响应与错误

成功通常为 HTTP 200，创建资源通常为 201。各接口响应结构见下文，**没有统一的 `data` 包装**：例如目录直接返回对象，在线列表为 `{players}`，愿望单为 `{ok,entries}`。可选字段可能省略；显式 `null` 表示未知或不存在，不能一概视为 0。

常见错误响应：

```json
{"ok":false,"error":"请先登录。","code":"signInRequired"}
```

`error` 是可读说明，`code` 在部分旧错误分支可能没有，部分响应还包含 `status`。优先检查 HTTP 状态，再检查 `ok`；不要依赖中文错误文案做逻辑分支。重定向和特殊响应在各接口单独说明。

| HTTP 状态 | 含义与处理 |
| --- | --- |
| 400 | 参数、格式或业务校验失败，修正后再请求 |
| 401 | 未登录、会话不可用或设备凭据无效 |
| 403 | 非本人资源、需认领玩家、同源校验失败或授权状态改变 |
| 404 | 资源或登录提供方不存在 |
| 409 | 意见已关闭、设备协议冲突等；读取当前状态后处理 |
| 410 | 设备授权码已过期，重新授权 |
| 413 | 请求体或图片超过上限 |
| 429 | 头像刷新或配图上传过于频繁 |
| 500 / 502 / 503 | 服务端或上游不可用；读取可退避重试，写入先确认是否已成功 |

## 功能配置与公开详情

`GET /health` 返回 `{ok:true}`（进程存活检查）；`GET /api/config` 返回 `{providers,mailAvailable,bindingArticleUrl,icpNumber,developers,sponsorship,donation,sourceUrl,administrators}`，不含密钥。`developers` 为配置的 `{name,playerId}` 数组；`sponsorship` 为署名文字；`donation` 为 `{label,url}`，未配置返回 null；`sourceUrl` 为开源链接，未配置返回空字符串；`administrators` 为所有 active 普通管理员的 `{name,playerId}` 数组，不含超级管理员；无有效玩家档案时 `playerId` 为 null，仅显示账户名称。

| 接口 | 响应 |
| --- | --- |
| `GET /api/campaigns` | `{campaigns}` |
| `GET /api/campaigns/{id}` | `{campaign,maps,challenges,halls,order}`，challenges 为包级挑战 |
| `GET /api/maps` | `{maps}` |
| `GET /api/maps/{id}` | `{map,campaign,challenges,relations}`，challenges 为地图挑战 |
| `GET /api/challenges` | `{challenges,multiMapChallenges}` |
| `GET /api/challenges/{id}` | `{scope,challenge,records,clearCount}`，记录含 DAG 继承 |
| `GET /api/players` | `{players}` |
| `GET /api/players/{id}` | `{player,records}`，个人成绩经 DAG 去重 |
| `GET /api/records` | `{records}`；可选 `challengeId`、`playerId` 查询参数 |
| `GET /api/records/{id}` | `{record}` |
| `GET /api/stats` | `{campaigns,maps,players,records}` 数量；records 按玩家/挑战去重 |
| `GET /api/suggestions` | `{suggestions}` |
| `GET /api/qa` | `{entries}` |
| `GET /api/farewell` | `{records}`，第九章每玩家一条有效金草莓记录 |
| `GET /api/hist` | `{maps:[{id,name,stars,subTier}]}`，PostgreSQL 地图评级 |

详情不存在返回 404；无效 ID 返回 400。公开读取排除隐藏、软删除和失效父级。列表暂不分页，搜索规则可使用 shared 纯函数。

## 公开目录

### GET /api/catalog

无需登录，无参数。返回完整目录对象，不分页，也不支持服务端搜索参数。可在客户端对正式名称、中文名和搜索别名建立索引。

| 顶层字段 | 内容 |
| --- | --- |
| `campaigns` | 地图包：`id,name,cnName?,shortName,author,url,goldenedCount,mapCount,blurb`，可含封面与搜索别名 |
| `maps` | 地图：`id,campaignId,name,cnName?,author,url,primaryTier,description,notice?,histStars?,histSubTier?` 等 |
| `challenges` | 地图挑战：`id,mapId,name,type,tier,clearCount,description,segment?,notice?` |
| `multiMapChallenges` | 地图包级挑战：`id,campaignId,name,tier,clearCount,description?,notice?` |
| `players` | 玩家公开资料：`id,name,bio?,bilibiliUid?,bilibiliUrl?,bilibiliUids?,aliases?,status?` |
| `submissions` | 记录数据：`id,challengeId,playerId,achievedAt,videoUrl`，可含 `status,rawVideoUrl,tags,opinionTier,recommends` 等 |
| `suggestions` | 公开意见及回复、票数、截止时间和处理状态；不提供回复者账户 ID |
| `campaignHalls` | 地图包大厅及地图分组 |
| `campaignOrders` | 地图包 ID → 根级顺序，元素格式为 `map:<id>` 或 `hall:<id>` |
| `challengeRelations` | 地图 ID → 显式保存的挑战 DAG 边；缺项不代表无默认关系 |
| `campaignMenu` | `{fixed:number[],favorites:number[]}`，地图包菜单配置 |

`bilibiliUids` 是按绑定顺序排列的 UID 数组；旧 `bilibiliUid` / `bilibiliUrl` 对应首个 ID。直播查询遍历全部 ID，取首个确认开播的直播间。

```js
const catalog = await fetch('/api/catalog').then(r => r.json());
const map = catalog.maps[0];
if (map) {
  const campaign = catalog.campaigns.find(c => c.id === map.campaignId);
  const challenges = catalog.challenges.filter(c => c.mapId === map.id);
  console.log(campaign, map, challenges);
}
```

所有地图按地图包呈现。地图挑战通过 `mapId` 关联地图；多地图挑战通过 `campaignId` 关联地图包，不能混在单张地图的挑战列表中。

正式 Tier 从难到易为：

```text
t-1, h0, m0, l0, h1, m1, l1, h2, m2, l2,
h3, m3, l3, t4, t5, t6, t7
```

`high-std` / `mid-std` / `low-std`（High / Mid / Low Std）依次排在 T7 之后；`undetermined` 为未定档，排在 Low Std 之后。这些档位不进入正式主榜。挑战 `tier:null` 不应借用地图 `primaryTier` 填补。请按上述业务顺序排序，不按字符串排序。中文名只使用正式 `cnName`；`notice` 是注意事项，与介绍 `description` 不同。

当前暂停 Std 挑战提交：新记录、新挑战提案、重新提交若目标为 Std，返回 `403` / `standardSubmissionDisabled`；难度意见仍支持 Std。

公开完成人数只统计有效 accepted 记录，排除隐藏、软删除和回收对象；DAG 后继记录可继承到前驱，不能简单把记录条数相加。玩家同图记录需要去重，难度建议和推荐不能继承到前驱。公开标签应排除 RAW，并合并 FC／月莓／moon 同义标签。

### GET /api/hist

返回 PostgreSQL 中地图的 Hist 评级，见前面的公开详情表。

## 在线状态与头像

| 接口 | 认证 | 成功响应 |
| --- | --- | --- |
| `GET /api/online` | 公开 | `{players:OnlinePlayer[]}` |
| `GET /api/players/{id}/presence` | 公开 | `{presence:{status,mapName,mapId}}` |
| `GET /api/players/{id}/avatar` | 公开 | `{ok:true,url:string|null}`，部分情况附带错误说明 |
| `POST /api/players/{id}/avatar` | 用户本人 | 同上，强制刷新本人头像 |

`OnlinePlayer` 包含 `playerId,playerName,mapId,mapName,mapCnName,campaignId,campaignName,campaignCnName,holdingGolden,challengeId,challengeName,tier,source,wishlistProgress,room,position,routeLength,liveUrl,activity`。未知地图、挑战、路线进度及直播链接等可为 null；`source` 为 `wishlist`、`clear` 或 null。`liveUrl` 仅在确认正在直播时提供。

`activity` 为 `golden`（带金）、`practice`（练习）、`clearing`（推图）或 `unknown`。带金优先；已通关视为练习；其余按当前房间最近最多 20 次尝试，有成功为练习，无成功（含空窗口）为推图，不要求满 20 次。房间数据缺失或无效为未知。推图显示“推图中”且排序最低；推图和未知的挑战、Tier、来源及愿望单进度为 null。其余沿用带金优先、挑战 Tier 排序。

在线状态在最后一次有效更新后 60 秒过期；每名玩家只返回最新在线设备对应的公开摘要。推测挑战仅用于展示，不是玩家已达成的记录。缺失路线进度表示未知，不是 0 或完成。

个人 presence 的 `status` 为 `online`、`offline` 或 `not_installed`。玩家不存在返回 HTTP 404、`{presence:null}`。个人摘要不包含设备 ID、房间和完整统计。

头像来源为玩家档案的 B 站 UID。强制刷新仅允许已认领该玩家的有效账户，必须发送 JSON Content-Type，可用空对象请求体；两次抓取至少间隔 1 分钟，过快返回 429。普通读取可能返回旧缓存或 `url:null`。

## 登录与账户

### 建立会话

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/auth/methods` | 无参数，可匿名 | `{available:[{id,kind,label,name,startPath?}],bound:[...]}`；匿名 bound 为空 |
| `GET /api/auth/session` | 无参数，可匿名 | `{account:Account|null}`；未登录仍为 200 |
| `POST /api/auth/register` | `{email,password,displayName?}` | `{ok:true,account}` 并建立会话 |
| `POST /api/auth/login` | `{email,password}` | `{ok:true,account}` 并建立会话；认证失败 401 |
| `POST /api/auth/logout` | 无请求体 | `{ok:true}`，销毁当前会话 |

methods 的 bound 条目为 `{provider,email,linkedAt,lastLoginAt,canUnbind}`，只返回本人已绑定的登录方式。

注册密码至少 8 个字符。注册响应成功不代表邮箱已经验证。可用登录方式由站点配置决定，先读取 methods。

`Account` 包含 `id,displayName,email,emailVerified,qqLinked,role,preferences`，以及可选的 `claimedPlayerId,claimedBilibiliName,bilibiliUid`。这是本人的私有账户投影，`role` 是服务端返回的只读字段。

### 第三方登录

`GET /api/auth/login/{provider}` 发起浏览器重定向；当前 provider 为 `diving-fish`。查询参数 `next` 只接受站内相对路径，默认 `/account`；`mode=bind` 表示显式绑定当前账户的登录方式，通常省略 mode 进行登录。

`GET /api/auth/callback/{provider}` 是提供方回调入口，使用 `code,state` 和服务端设置的短期事务 Cookie 完成验证，然后重定向。不要把回调当成可直接提交身份的 JSON 接口。未知提供方返回 404，未配置返回 503；流程失败通常重定向至带 `auth_error` 的账户页。

### 账户维护

以下接口需要用户会话：

| 接口 | JSON 请求体 / 路径 | 成功响应与说明 |
| --- | --- | --- |
| `PATCH /api/auth/account` | `{displayName?,email?}` | `{ok:true,account}`；修改邮箱会重新验证 |
| `PATCH /api/auth/preferences` | 偏好对象，见下文 | `{ok:true,account}`，合并本人偏好 |
| `POST /api/auth/password` | `{currentPassword?,nextPassword}` | `{ok:true}`；已有密码时需提供当前密码 |
| `DELETE /api/auth/identity/{provider}` | 已绑定的提供方 ID | `{ok:true}`；必须保留至少一种登录方式 |
| `POST /api/auth/email/verify` | 无请求体 | `{ok:true}`，重发验证邮件 |

常用偏好字段：`nameMode:"cn"|"both"|"en"`、`onlyOfficialChinese:boolean`、`compactTierLabels:boolean`、`showHistRatings:boolean`、`tierColors:Record<string,string>`、`favoriteCampaignIds:string[]`。

无需登录的邮件流程：

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/auth/email/verify` | 查询参数 `token`，来自邮件 | 重定向 `/account`，用查询参数反馈验证结果 |
| `POST /api/auth/password/forgot` | `{email}` | `{ok:true,message}`，不透露邮箱是否存在 |
| `POST /api/auth/password/reset` | `{token,password}` | `{ok:true}` |

邮件流程依赖站点 SMTP 配置；forgot 返回成功不保证邮件已发送，也不保证该邮箱有账户。

## 玩家认领

以下接口需要有效用户会话；写请求必须为 JSON，并通过同源校验。目标 UID 不等于申请人身份，生成码不会立即认领。

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/auth/claim` | 无参数 | `{ok:true,binding:Binding|null,articleUrl:string|null,account}` |
| `POST /api/auth/claim` | `{action:"begin",uid,playerId?}` | `{ok:true,binding,articleUrl}`，生成一次性绑定码 |
| `POST /api/auth/claim` | `{action:"verify"}` | `{ok:true,account,binding:null}`，读取目标 UID 的签名并完成认领 |
| `POST /api/auth/claim` | `{action:"cancel"}` | `{ok:true,binding:null}`，取消本人待验证码，原认领不变 |
| `GET /api/auth/claim-requests` | 无参数 | `{ok:true,request:ClaimRequest|null}`，只读历史申请 |

`Binding` 包含 `id,code,bilibiliUid,bilibiliName,playerId,expiresAt,nextCheckAt`。时间为 ISO 字符串；`playerId` 可为 null。`code` 格式为 `XXXX-XXXX`，7 天有效，一次性使用，只返回给申请人及有权限核对的管理员。昵称由服务端从 B 站获取，不接受客户端自报昵称。`uid` 接受数字 UID 或 B 站主页链接；指定已有 `playerId` 时，UID 必须属于该玩家的已登记 UID 列表。

玩家可用目标 B 站账号在 `articleUrl` 指定专栏评论绑定码，等待管理员核对评论者身份；或把该账号签名完整替换成绑定码，修改后等待 10 秒再验证。服务端核对返回 UID 和完整签名，至少等待生成后 10 秒，按账户与 UID 强制一分钟检查间隔，失败也计入冷却；过快返回 429。签名验证失败响应携带最新 `binding`（可能为 null）以便刷新冷却时间。生成码也有账户一分钟冷却；取消/换码不能绕过冷却。重复请求相同有效目标可返回原码。

未接受的绑定码不占用玩家或 UID，也不创建玩家档案或改变已有认领。接受时重新核验占用与回收状态，成功才在同一事务中完成建档/认领和消费绑定码。多 UID 档案验证其中一个，账户记录实际验证的 UID。

旧的直接认领请求体返回 `bindingRequired`；`POST /api/auth/claim-requests` 已停用并返回 HTTP 410。`ClaimRequest` 只用于历史读取，含 `id,bilibiliUid,bilibiliName,nameSource,status,createdAt,reviewNote?`。

## 挑战记录

### POST /api/submissions

已有 Standard 挑战的记录按服务端数据库难度直接置为 `accepted`，作为未经核实的公开个人记录；其余记录与所有新挑战提案仍为 `pending`。两个挑战作用域均适用，不采信客户端声明的难度。

记录响应包含只读布尔字段 `verified`（属于玩家记录，不属于挑战）。新提交默认 false；正式 Tier 记录经管理员通过后设为 true，Standard 及 QQ 自动归档不设置为 true。Tier 降为 Standard 保留此标记；Standard 升为正式 Tier 时，所有未 verified 的记录转为 pending。客户端不能直接修改 verified，玩家编辑后重投会重置为 false。

需要登录且已认领玩家。创建提交记录，成功为 HTTP 201、`{ok:true,record}`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `challengeId` | number | 普通记录必填，可指向地图或地图包级挑战 |
| `videoUrl` | string | 必填，HTTP(S) 视频链接，最多 2000 字符 |
| `achievedAt` | string | 必填，`YYYY-MM-DD` |
| `rawVideoUrl` | string | 可选，HTTP(S) 未剪辑录像链接，最多 2000 字符 |
| `playerNote` | string | 可选，最多 4000 字符 |
| `duration` | string | 可选，最多 100 字符 |
| `opinionTier` | string | 可选，接受正式 Tier 与三档 Standard |
| `recommends` | boolean | 可选，推荐或不推荐 |
| `addFc` | boolean | 可选，默认 false；仅新提交已有 C/FC 类型挑战时可为 true，按数据库类型校验并写入固定颜色的 FC 标签。正式难度仍待审，Standard 连同标签直接公开 |
| `kind` | string | 新挑战提案使用 `challenge`，普通记录可省略 |
| `proposedTarget` | object | 新挑战提案必填，见下文 |

```json
{
  "challengeId": 123,
  "videoUrl": "https://example.com/video",
  "achievedAt": "2026-09-09",
  "recommends": true
}
```

新挑战提案使用 `kind:"challenge"`，不需要已有 challengeId，但仍需视频与达成日期。`proposedTarget` 必填 `campaignName,mapName,challengeName,gameBananaUrl`，可选 `suggestedTier,rules`。`gameBananaUrl` 必须为 GameBanana 的 `/mods/编号` 或 `/wips/编号` 地图页面链接，重新提交新挑战时同样必填；此处 suggestedTier 接受正式 Tier、三档 Standard 或 `undetermined`。名称应来自正式资料或用户提供的对照。

同一玩家可以多次提交同一挑战，审核通过的重复记录在个人成绩中只计一次并展示最近达成的一条，挑战通关列表展示全部有效记录。RAW 对所有难度均可省略。响应中的 record 包含新记录 ID、归属、日期、视频、`status:"pending"` 或 `status:"accepted"` 及已保存的可选字段。

### GET /api/submissions

需要登录且已认领玩家，只返回本人认领玩家名下**审核中与已拒绝**的提交：`{ok:true,records}`。每条含 `id,challengeId,playerId,status,verified,achievedAt,videoUrl,createdAt`，以及可选的 `rawVideoUrl,playerNote,verifierNote,duration,opinionTier,recommends,proposedTarget,reviewedAt`。`verifierNote` 是审核意见，用于说明被拒原因；已通过与隐藏的记录不在这里，撤回后的记录也不再返回。

### PATCH /api/submissions/{id}

有效登录账户修改本人认领玩家名下**审核中或已拒绝**的提交并重新送审：已有 Standard 挑战的记录直接置为 `accepted`，其余回到 `pending`，上一次的审核结论作废。字段与 `POST /api/submissions` 相同（`addFc` 仅用于新提交，重新提交保留已有标签），`videoUrl` 与 `achievedAt` 必填；`rawVideoUrl,playerNote,duration` 留空即清空，`opinionTier,recommends` 省略则保持原值。是普通记录还是新挑战提案由库里的记录决定，不能互相切换：普通记录可以改 `challengeId`（只能改成现存挑战），提案记录改 `proposedTarget`。成功返回 `{ok:true,record}`；记录不存在为 404，非本人为 403，已通过或隐藏为 409。

### DELETE /api/submissions/{id}

有效登录账户撤回本人认领玩家名下的提交，任何状态都可以撤回。撤回后记录进入回收站（软删除并生成回收站条目），是否最终删除仍由管理员决定。成功返回 `{ok:true}`，记录不存在或已撤回为 404，非本人为 403。

### PATCH /api/submissions/{id}/opinion

有效登录账户只能修改本人认领玩家的记录意见。请求 `{recommends?:boolean|null,opinionTier?:string|null}`，省略字段保持原值，null 清空；opinionTier 仅接受正式 Tier。成功返回 `{ok:true,record}`，记录不存在为 404，非本人为 403。

## 愿望单

| 接口 | 认证与请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/wishlist?playerId={id}` | 公开，指定玩家 | `{ok:true,entries:WishlistEntry[]}` |
| `GET /api/wishlist` | 用户会话，不传 playerId | `{ok:true,entries:WishlistEntry[]}`，本人愿望单 |
| `POST /api/wishlist` | 用户会话，`{challengeId}` | HTTP 201、`{ok:true,entry}`；已存在则返回原条目 |
| `PATCH /api/wishlist` | 用户会话，`{id,...patch}` | `{ok:true,entry}` |
| `DELETE /api/wishlist?id={id}` | 用户会话，删除本人条目 | `{ok:true}` |
| `DELETE /api/wishlist?challengeId={id}` | 用户会话，按挑战删除本人条目 | `{ok:true,removed:boolean}` |

`WishlistEntry` 为 `{id,playerId,challengeId,status,progress,bestDeaths?,comment?,practiceDuration?,createdAt,updatedAt}`。公开读取没有对应认领账户时返回空数组。本人写入无需在请求中指定玩家，不能用公开读取的 playerId 参数切换写入身份。

PATCH 可修改：`status`（`active` 正在练、`soon` 即将练、`later` 以后练、`archive` 归档）、`progress`（0–100 的数值）、`bestDeaths`（非负数或 null，null 清空）、`comment`（文字）、`practiceDuration`（文字）。省略字段保持原值。删除同时传 id 和 challengeId 时优先 challengeId。

## 意见与回复

需要有效用户会话，写入接受同源请求。公开意见与其他人的回复从 `/api/catalog` 的 suggestions 读取。

### POST /api/suggestions

成功为 HTTP 201、`{ok:true,data:{id}}`。`body` 必填，最多 10000 字符；不同 kind 的请求如下：

| kind | 其他必填字段 | 用途 |
| --- | --- | --- |
| `general` | `title`，最多 200 字符 | 一般建议 |
| `placement` | `challengeId,suggestedTier` | 挑战难度调整，支持正式 Tier、high-std、mid-std、low-std、undetermined |
| `split` | `mapId` | 地图拆分建议，只能指向地图 |

目标名称、作者与当前 Tier 快照由服务端确定。挑战类意见默认有 7 天投票期；一般建议在最终决定前可回复，不设投票截止时间。

### GET /api/suggestions/{id}/response

只读取本人回复，成功 `{ok:true,data:{vote,comment}}`。未回复时为 `{vote:"NONE",comment:""}`。

### POST /api/suggestions/{id}/response

请求 `{vote?,comment?}`，至少提供一个字段。vote 为 `FOR`、`AGAINST`、`INDIFFERENT` 或 `NONE`；NONE 撤票但保留评论。comment 最多 10000 字符，空字符串清空评论。省略的字段保持原值。

成功 `{ok:true,data:{id,vote,comment}}`。意见不存在为 404，截止或已最终决定为 409。是否完成挑战由服务端根据本人有效记录与 DAG 计算，不接受客户端传入的完成状态。

## 反馈与配图

### POST /api/feedback

支持匿名文字反馈。请求 `{title,detail,pageUrl?,attachmentIds?}`：title 最多 200 字符，detail 最多 10000 字符，pageUrl 最多 2000 字符。成功 HTTP 201、`{ok:true,report}`；report 包含 `id,title,detail,reporter,createdAt,status`，可含 pageUrl 和 attachments。

有配图时必须登录，attachmentIds 最多 4 个，只接受本人上传且尚未提交的附件 ID。作者身份由服务端确定，不接受自行指定 reporter。

### POST /api/feedback/attachments

需要有效用户会话。使用 `multipart/form-data`，文件字段名为 `file`，单张上限 5 MiB。浏览器使用 FormData 时不要自行设置 Content-Type，让浏览器生成 boundary。

```js
const form = new FormData();
form.append('file', fileInput.files[0]);
const response = await fetch('/api/feedback/attachments', {
  method: 'POST', body: form,
});
const result = await response.json();
// 将 result.attachment.id 放进反馈的 attachmentIds
```

成功 HTTP 201、`{ok:true,attachment:{id,url,contentType,bytes}}`。服务端检查图片内容；超过容量为 413，最近一小时未提交附件达到 20 张为 429，存储未配置为 503。

### DELETE /api/feedback/attachments?id={id}

需要有效用户会话，仅撤下本人尚未提交的图片，成功 `{ok:true}`。已绑定到反馈的附件不能用此接口撤下；响应 ok 不代表给定 ID 一定被删除。

## 本人设备与统计

以下接口使用**网站 Cookie 会话**，要求有效账户。

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/tracker/devices` | 无参数 | `{ok:true,devices:[{id,name,clientName,createdAt,lastSeenAt,revokedAt}]}` |
| `DELETE /api/tracker/devices/{id}` | 本人设备 ID，同源 | `{ok:true,id}`，立即撤销凭据，可重复调用 |
| `PATCH /api/tracker/preferences` | `{saveHistory:boolean}`，同源 | `{ok:true,saveHistory}` |
| `DELETE /api/tracker/preferences` | 无请求体，同源 | `{ok:true,saveHistory:false}`，删除本人全部同步历史 |
| `GET /api/tracker/stats?mapId={id}` | 可重复传 mapId，最多取前 200 个 | `{ok:true,stats}`，本人地图统计 |
| `GET /api/tracker/presence` | 无参数 | `{ok:true,devices:[{deviceId,deviceName,updatedAt,online,observation}]}` |
| `GET /api/tracker/map-binding` | 无参数 | `{ok:true,scopes:[...]}`，本人最近进入的未配对 SID／面，最多 10 项 |
| `POST /api/tracker/map-binding` | `{sid,side,mapId}` | HTTP 201、`{ok:true,id}`，提交配对指认 |

stats 是数组，每项包含 `mapId,sid,side,projection,deviceLabel,syncedAt,datasetCount,totalDeaths,noGoldenBestDeaths`；没有配对或没有上传数据的地图不在数组中，空 mapId 列表返回空数组。projection 可为 null，否则包含 `window,rooms,hardest,golden,goldenSession,chokes,lastGameplayRoom`；其中成功率等比率使用 0–1，null 表示无样本。

map-binding 的 scopes 条目为 `{sid,side,pendingMapId:number|null}`，pendingMapId 表示本人尚待审核的指认目标。

设备列表不返回 token 或摘要。关闭保存会停止设备访问，但保留已有统计；删除历史还会轮换授权时期并关闭保存，防止旧上传队列恢复已删除数据。

统计只对本人开放，不接受 playerId 选择他人数据；同图多个设备／数据集取最新一份，不相加。手填愿望单字段不会被 Mod 统计覆盖。presence 的 observation 仅在线时可用，离线为 null，结构见「设备实时状态」。

指认要求本人确实进入或上传过该 SID／面，side 为 `Normal`、`BSide`、`CSide`；目标只能是现有地图。指认经审核才成为全站有效配对，提交成功不代表立刻生效。

## 设备授权

设备使用 PKCE S256 授权，玩家在浏览器登录并确认。授权 token 是本人设备凭据，无固定到期时间，可撤销。

1. 设备生成长度 43–128 的随机 `codeVerifier`，字符集为字母、数字和 `-._~`；计算 `base64url(SHA-256(codeVerifier))` 作为 challenge，不带填充等号。
2. 打开本站 `/tracker/activate`，传入下表同名查询参数，由玩家确认。
3. 确认页通过用户会话调用 `POST /api/tracker/authorizations`。授权码仅有效 5 分钟、只能兑换一次；同时开启账户保存功能。
4. 设备从回环回调或玩家手工复制取得 code，校验回调 state，再兑换 token。

### POST /api/tracker/authorizations

需要有效用户 Cookie 与同源请求。JSON 参数：

| 字段 | 要求 |
| --- | --- |
| `code_challenge` | 必填，43 字符的 base64url SHA-256 |
| `code_challenge_method` | 必填，固定 `S256` |
| `redirect_uri` | 可选，只允许带显式非默认端口的 `http://127.0.0.1:端口/路径` 或 IPv6 回环地址；不接受 localhost、凭据或 fragment |
| `state` | 可选，最多 512 个可打印 ASCII 字符，回调原样返回 |
| `device_name` | 可选，设备显示名，最多保留 64 字符 |
| `client_name` | 可选，客户端名称，最多保留 64 字符 |

成功 HTTP 201、`{ok:true,code,redirectTo:string|null}`。无 redirect_uri 时通过页面手工复制 code。回环 URL 的自带查询参数会被丢弃，最终 query 由服务端填入 code 和 state。

### POST /api/tracker/devices/token

不需要 Cookie，使用一次性 code 与 PKCE 凭据：

```json
{"code":"授权码","codeVerifier":"设备之前生成并保留的 verifier"}
```

成功 `{ok:true,deviceId,accessToken,deviceName}`。accessToken 只在这次响应中出现，设备须妥善保存。code 不存在为 400、已使用为 409、过期为 410、verifier 不匹配为 403；兑换成功但响应丢失时需要重新授权。

## 设备配置与地图资料

本节和后续同步接口均使用 `Authorization: Bearer <accessToken>`，不用网站 Cookie。未知或撤销 token、关闭保存时返回 HTTP 401：

```json
{"ok":false,"error":"device_unauthorized","code":"device_unauthorized"}
```

客户端收到 401 应停止同步并提示处理授权。

### GET /api/tracker/config · POST /api/tracker/config

无参数；POST 可用空请求体或 `{}`。返回 `{ok:true,deviceId,limits:{attemptsPerRoom,roomsPerScope,scopeBytes,scopesPerAccount}}`。目前分别为 100、2000、8388608、1000；客户端应读取服务端下发值。

### GET /api/tracker/overlay-context

查询参数 `sid`（1–400 字符，无首尾空格）、`side`（Normal／BSide／CSide）均必填，必须 URL 编码。

```js
const query = new URLSearchParams({ sid: '作者/地图SID', side: 'Normal' });
const response = await fetch(`${origin}/api/tracker/overlay-context?${query}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

返回 `{ok:true,schema:"goldenlink.context/1",sid,side,matched,map,challenges}`。匹配时 map 为 `{id,name,cnName,campaign:{id,name,cnName}}`，challenges 为 `{id,name,type,tier}[]`；未匹配时 `matched:false,map:null,challenges:[]`，仍为 HTTP 200。

只读取审核通过的 SID／面配对，排除软删除地图、地图包和挑战，不包含地图包级挑战、账户或统计。无正式中文名和未知 Tier 保留 null，服务器不替玩家选择挑战。无效参数为 400、`invalid_overlay_scope`。

## 设备实时状态

### POST /api/tracker/presence

设备 Bearer 认证，请求体最大 1 MiB。所有动作返回 `ok:true`。

| action | JSON 请求 | 成功响应其他字段 |
| --- | --- | --- |
| `start` | `{action:"start"}` | `connectionId,ttlSeconds:60` |
| `snapshot` | `{action:"snapshot",connectionId,sequence,observation,transitions?}` | `sequence,ttlSeconds:60` |
| `stop` | `{action:"stop",connectionId,sequence}` | `sequence,ttlSeconds:60` |

connectionId 由 start 返回；sequence 为非负安全整数，首个 snapshot 应从 1 开始，此后严格递增。旧 connectionId、重复或倒退的 sequence 返回 409、`presence_conflict`，应重新 start 对齐。默认客户端每 5 秒发送 snapshot；60 秒无有效更新或 stop 后离线。

`transitions` 可选，最多 256 个与 observation 同结构的观测，按实际发生顺序提交房间/地图/持金变化；observation 为批次末尾的当前状态。服务端在同一事务中依次处理 transitions 和 observation 的带金到达提醒，只保存最新 observation。带 transitions 的最后一批允许以相同 connectionId、sequence 和完全相同内容重试，返回原 ACK，不重复触发通知或延长在线 TTL；同 sequence 改内容、较旧批次及 stop 后重试仍被拒绝。旧客户端省略 transitions 时沿用单快照语义。

observation 必须包含以下全部字段，另可传可选的 `datasetId`（当前存档数据集 UUID 或 null）：

```json
{
  "sid": "作者/地图SID",
  "side": "Normal",
  "room": "room-a",
  "paused": false,
  "transitioning": false,
  "holdingGolden": true,
  "cctAvailable": true,
  "cctTrackingPaused": false
}
```

sid 与 side 必须同时有值或同时为 null；sid 最多 512 字符。room、paused、transitioning、holdingGolden、cctTrackingPaused 允许 null，cctAvailable 必须为 boolean。没有地图时 room、paused、transitioning、holdingGolden 也必须为 null。未知字段或不满足约束返回 400。

建议新版 Mod 在实时 observation 中上传与统计一致的 datasetId，以准确关联当前存档。旧版省略时，在线列表使用同设备、同 SID/面的最新 CCT 数据集；无 CCT 时只有唯一一份本体统计才使用其通关标记，多份视为未知。

## 设备累计统计

### POST /api/tracker/area-stats

设备 Bearer 认证。独立于 CCT 房间状态上传：

```json
{
  "datasetId": "12345678-1234-4234-8234-123456789abc",
  "sid": "作者/地图SID",
  "side": "Normal",
  "noGoldenBestDeaths": 12,
  "totalDeaths": 345,
  "completed": true,
  "source": "observed_no_native_golden_clear_v1",
  "practiceDetection": "none"
}
```

datasetId 为 UUID，side 为 Normal／BSide／CSide。死亡数为 0–2147483647 的整数或 null，可省略；两个死亡数与 completed 均未知时只返回已有值，不新增统计。completed 为 boolean 或 null，可省略；仅传 completed 也能新增统计。source 和 practiceDetection 固定为示例值。成功 `{ok:true,noGoldenBestDeaths,totalDeaths,completed,source,practiceDetection:"none"}`，返回合并后的值。

completed 表示该游戏存档的地图面是否已通关，不代表金榜挑战达成。true 为已通关，false 为明确未通关，null/省略为未知；同一数据集内一旦为 true，后续 false 或未知不回退它，未知也不覆盖 false。旧数据不回填，不从 PB 自动推断。

同账户／设备／数据集／SID／面下，noGoldenBestDeaths 取最小值，totalDeaths 取最大值，不求和。无金最少死亡只记录明确未携带本体金莓的完整通关，不从未区分金莓的 BestDeaths 导入。旧存档恢复或计数重置应使用新 datasetId 或清空后重导。

## CCT 状态同步

这些接口记录当前 CCT 状态，协议随当前客户端实现演进，不作为长期固定的跨版本协议。设备 Bearer 认证；默认 HTTP 请求体上限 9 MiB，规范化单个状态上限 8 MiB。scope 隔离设备、存档数据集、地图面与 segment。

### 共用模型

```ts
type Scope = {
  datasetId: string; // UUID
  sid: string;       // 1–512 字符，区分大小写
  side: 'Normal' | 'BSide' | 'CSide';
  segmentKey: string; // 非空，最多 256 字符
};
type Cursor = { streamEpoch: string; revision: number; stateHash: string };
type Room = {
  roomKey: string;
  previousAttempts: boolean[]; // 最多 100 项，true 为成功
  successStreak: number;      // 可为负安全整数
  successStreakBest: number;
  goldenBerryDeaths: number;
  goldenBerryDeathsSession: number;
  deathsInCurrentRun: number;
};
type Metadata = {
  cctVersion: string;
  adapterVersion: string;
  cctSessionKey: string;
  settings: { trackNegativeStreaks: boolean; selectedAttemptCount: 5 | 10 | 20 | 100 };
  chapter: { goldenCollectedCount: number; goldenCollectedCountSession: number };
  route: Route | null;
};
type State = { metadata: Metadata; rooms: Room[] };
type Route = {
  nodes: {
    roomKey: string; checkpointKey: string; groupedRooms: string[];
    isNonGameplayRoom: boolean; customRoomName: string | null;
  }[];
  ignoredRooms: string[];
  chapterSID: string | null;
  campaignName: string | null;
  chapterName: string | null;
  sideName: string | null;
  checkpoints: { checkpointKey: string; name: string | null; abbreviation: string | null }[];
};
```

除 successStreak 外计数均为非负安全整数；session 计数不得大于总数。rooms 的 roomKey 唯一，最多 2000 房间；房间键按原值匹配，不去空格、不转小写。route 的 checkpointKey 唯一，节点必须引用存在的 checkpoint；chapterSID 有值时须等于 scope.sid。名称只作为显示线索，不能替代 SID 或目录身份。

### POST /api/tracker/cct/state

请求 `{scope}`。返回 `{ok:true,current:null}`，或 current 包含当前游标和完整 state。用于断线重连对齐，不增加 revision；只读回本设备的 scope。

### POST /api/tracker/cct/baseline

请求 `{scope,mutationId,streamEpoch,revision,expected,state}`。mutationId 与 streamEpoch 为 UUID，revision 为非负安全整数。首次安装 expected 为 null；覆盖必须带当前完整 Cursor，不能只传 revision。同一 streamEpoch 内，覆盖的 revision 必须大于现有值。

成功 `{ok:true,streamEpoch,revision,stateHash,duplicate}`。服务端计算并返回 stateHash；duplicate 表示当前最后一条命令的完全相同重试。

### POST /api/tracker/cct/change

请求 `{scope,mutationId,expected,revision,patch,afterStateHash}`。expected 为当前完整 Cursor，revision 必须为当前值加 1。

patch 为 `{replaceRooms:Room[],removeRooms:string[],metadata?:Metadata}`，两个数组均必填；替换是整条房间状态替换，metadata 提供时也是整体替换。替换与删除键不能重复。

成功响应与 baseline 相同。afterStateHash 为应用 patch 后规范化完整 State 的 SHA-256 十六进制摘要：房间按 roomKey 的 ordinal 顺序排列；对象键排序、数组保留顺序，紧凑 JSON 编码后计算 UTF-8 摘要。不要直接对任意键序的请求 JSON 求 hash。哈希不符会整笔回滚。

### 对齐与重试

`cursor_conflict`、`stale_revision`、`revision_gap`、`baseline_required`、`mutation_conflict`、`state_hash_mismatch` 返回 409：先读 cct/state，再决定重建 baseline 或补齐增量，不要盲重试。ACK 丢失时，仅最后一条完全相同命令可按原 mutationId 重试并得到 duplicate；旧命令不会重新应用。

`history_disabled`、`history_epoch_invalid` 为 403，停止上传并重新处理授权；`scope_too_large` 为 413，缩小状态；`scope_quota_exceeded` 为 409，处理账户作用域容量。设备错误统一为 `{ok:false,error:code,code}`；其他校验错误一般为 400，内部失败为 500。

## 管理员接口

要求有效 admin 或 super_admin 会话 Cookie。管理员角色每次由服务端读取；非管理员返回 403。超级管理员任免和回收站最终确认另做 super_admin 检查。设备 Bearer token 不能调用管理接口。

管理公共接口成功格式为 `{ok:true,data:...}`，失败为 `{ok:false,error}` 并配合 HTTP 状态。目录和审计写入共用事务，失败不保留半批数据。脚本可通过 `/api/auth/login` 建立会话，并将 Cookie 保存在仅本人可读的文件中。

### POST /api/admin/catalog/batch

批量创建或部分修改地图包、地图、挑战。请求：

```json
{
  "dryRun": true,
  "operations": [
    {"kind":"campaign","action":"create","ref":"pack","data":{"name":"Example Pack"}},
    {"kind":"map","action":"create","ref":"map","data":{"name":"Example Map","campaignId":"$pack"}},
    {"kind":"challenge","action":"create","data":{"name":"C/FC","scope":"map","mapId":"$map","type":"C/FC","tier":"mid-std"}}
  ]
}
```

- `operations` 必须为 1–200 项。`kind` 为 campaign/map/challenge，`action` 为 create/update。
- create 必须提供 `data.name`；update 必须提供数字 `id` 或同类前序操作引用。
- `ref` 可选，同批唯一，仅含字母、数字、下划线、连字符。`$ref` 只能引用前序操作，且必须匹配父级或目标类型。
- `dryRun` 默认 true。预览完整执行校验后回滚，结果 ID 是临时分配值；真实提交需要显式 false，并读取该次返回的新 ID。
- update 只修改提供的字段；未知字段拒绝。批量接口不移动已有地图或挑战，不改变挑战作用域，不恢复回收项。
- 单次请求原子执行；create 没有跨请求幂等键，超时后先查询结果，不能盲目重试创建。

| 类型 | data 可用字段 |
| --- | --- |
| campaign | name、cnName、aliases、banner、publicationUrl、notice、author、description |
| map | name、cnName、aliases、banner、notice、campaignId、histRating、author、description |
| challenge | name、tier、notice、description、type、scope、mapId、campaignId |

`name` 必须非空；`cnName` 必须来自正式对照。aliases 为字符串数组，banner 是已登记的 OSS objectKey。可空文本以 null 清空；author、description 空值以空字符串清空。`histRating` 使用字符串 `none`（无评级）、`pending`（未定档）或 `1-lower` 至 `5-upper`（星数及上下档）。challenge 默认 type=Other、tier=undetermined，Tier 接受正式档位、三档 Std、undetermined 或 null。scope 与父级必须对应；地图包挑战不能填 mapId。

响应：

```json
{"ok":true,"data":{"dryRun":false,"results":[{"index":0,"kind":"campaign","action":"create","id":1,"ref":"pack"}]}}
```

### POST /api/admin/assets

上传封面，`multipart/form-data`，仅一个名为 `file` 的图片文件，上限 5 MiB，支持 JPEG/PNG/GIF/WebP，校验文件头。返回 HTTP 201：

```json
{"ok":true,"data":{"objectKey":"catalog/example.png","url":"https://cdn.example.test/catalog/example.png","contentType":"image/png","bytes":12345}}
```

后续编辑 banner 使用 objectKey；url 仅用于展示。未配置 OSS 返回 503。文件存于 OSS，数据库保存索引。

### 目录与管理命令

| 接口 | 请求 / 用途 |
| --- | --- |
| `POST /api/admin/catalog` | 单次新建及子树创建：kind/name，map 用 campaignId，challenge 明确 scope 及父级；挑战及嵌套 challenges 可传 type（C、FC、C/FC、All Major Secrets、Silver Segment、Other），省略默认 Other；批量脚本推荐上面的 batch |
| `PUT /api/admin/catalog` | 整份编辑表单：kind/id/name 及该类型可编辑资料；省略可选字段可能清空。挑战 type 可编辑，省略保留原类型，无效值拒绝。部分修改使用 batch |
| `PUT /api/admin/maps/{id}/relations` | `{edges:[{from,to}]}`，整份替换同图 DAG，校验无环 |
| `PUT /api/admin/maps/{id}/order` | `{challengeIds:number[]}`，地图挑战顺序 |
| `PUT /api/admin/campaigns/{id}/challenge-order` | `{challengeIds:number[]}`，包级挑战顺序 |
| `PUT /api/admin/campaigns/{id}/layout` | `{halls,rootTokens}`，整份大厅和根级顺序 |
| `PUT /api/admin/campaign-menu` | `{fixed:number[],favorites:number[]}` |
| `POST /api/admin/catalog/maps/batch` | 既有包下补地图并建立 SID/面配对，默认预览，按 SID/面幂等 |
| `POST /api/admin/map-bindings/batch` | 正式名称匹配已有地图后批量配对，默认预览，不覆盖冲突目标 |
| `GET /api/admin/submissions` | 管理审核记录 |
| `GET /api/admin/players` | 玩家管理及认领状态 |
| `GET /api/admin/tasks` | 待办与反馈 |
| `PATCH /api/admin/tasks/{id}` | 完成待办，无需请求体 |
| `GET /api/admin/trash` | 回收条目 |
| `POST /api/admin/trash` | `{kind,id}` 回收实体 |
| `POST /api/admin/trash/{id}` | `{action:"restore"}` 恢复；confirm 最终确认仅超级管理员；按地图包→地图→挑战→记录层级物理级联删除；玩家删除档案及记录但保留登录账户 |
| `GET /api/admin/audit` | 审计分页及类型/日期过滤 |
| `GET /api/admin/accounts` | 超级管理员读取账户权限 |
| `PATCH /api/admin/accounts/{id}/role` | 超级管理员任免，`{role:"player"|"admin"}` |

管理员审核接口 `POST /api/admin/submissions/:id/review` 支持 `{status:"pending"}` 将 accepted/hidden 记录退回待审核；清除 verified、审核者、审核时间和认领提示，保留归属、录像、标签及审计历史，并写入退回日志。回退请求不能携带 challengeId 或 retainedIds；其他状态回退返回 409。

下面列出全部管理路由及实现入口，复杂审核、拆分、合并和布局的字段校验以相应命令类型为准。所有实体 id/外键均为数字，地图/大厅排序 token 仍为字符串。

| 方法 | 路径 | 实现 |
| --- | --- | --- |
| POST | `/api/admin/catalog/batch` | [路由与命令](../src/modules/catalog/admin-routes/catalog-batch.ts) |
| POST | `/api/admin/assets` | [路由与命令](../src/modules/assets/routes.ts) |
| PATCH | `/api/admin/accounts/:id/role` | [路由与命令](../src/modules/auth/admin-routes/accounts-id-role.ts) |
| GET | `/api/admin/accounts` | [路由与命令](../src/modules/auth/admin-routes/accounts.ts) |
| GET | `/api/admin/audit` | [路由与命令](../src/modules/admin/admin-routes/audit.ts) |
| PUT | `/api/admin/campaign-menu` | [路由与命令](../src/modules/admin/admin-routes/campaign-menu.ts) |
| PUT | `/api/admin/campaigns/:id/challenge-order` | [路由与命令](../src/modules/catalog/admin-routes/campaigns-id-challenge-order.ts) |
| PUT | `/api/admin/campaigns/:id/layout` | [路由与命令](../src/modules/catalog/admin-routes/campaigns-id-layout.ts) |
| POST | `/api/admin/catalog/maps/batch` | [路由与命令](../src/modules/catalog/admin-routes/catalog-maps-batch.ts) |
| POST | `/api/admin/catalog` | [路由与命令](../src/modules/catalog/admin-routes/catalog.ts) |
| PUT | `/api/admin/catalog` | [路由与命令](../src/modules/catalog/admin-routes/catalog.ts) |
| POST | `/api/admin/challenges/:id/merge` | [路由与命令](../src/modules/catalog/admin-routes/challenges-id-merge.ts) |
| POST | `/api/admin/challenges/:id/split` | [路由与命令](../src/modules/catalog/admin-routes/challenges-id-split.ts) |
| PATCH | `/api/admin/feedback/:id` | [路由与命令](../src/modules/feedback/admin-routes/feedback-id.ts) |
| GET | `/api/admin/golden-room-rules` | [路由与命令](../src/modules/tracker/admin-routes/golden-room-rules.ts) |
| POST | `/api/admin/golden-room-rules` | [路由与命令](../src/modules/tracker/admin-routes/golden-room-rules.ts) |
| POST | `/api/admin/map-bindings/batch` | [路由与命令](../src/modules/tracker/admin-routes/map-bindings-batch.ts) |
| GET | `/api/admin/map-bindings` | [路由与命令](../src/modules/tracker/admin-routes/map-bindings.ts) |
| PATCH | `/api/admin/map-bindings` | [路由与命令](../src/modules/tracker/admin-routes/map-bindings.ts) |
| PUT | `/api/admin/maps/:id/order` | [路由与命令](../src/modules/catalog/admin-routes/maps-id-order.ts) |
| PUT | `/api/admin/maps/:id/relations` | [路由与命令](../src/modules/catalog/admin-routes/maps-id-relations.ts) |
| GET | `/api/admin/player-bindings/preview` | [路由与命令](../src/modules/players/admin-routes/player-bindings-preview.ts) |
| POST | `/api/admin/player-bindings/preview` | [路由与命令](../src/modules/players/admin-routes/player-bindings-preview.ts) |
| POST | `/api/admin/player-bindings` | [路由与命令](../src/modules/players/admin-routes/player-bindings.ts) |
| POST | `/api/admin/player-claims/:id` | [路由与命令](../src/modules/players/admin-routes/player-claims-id.ts) |
| GET | `/api/admin/player-claims` | [路由与命令](../src/modules/players/admin-routes/player-claims.ts) |
| PATCH | `/api/admin/players/:id` | [路由与命令](../src/modules/players/admin-routes/players-id.ts) |
| POST | `/api/admin/players/:id/unlink` | [路由与命令](../src/modules/players/admin-routes/players-id-unlink.ts) |
| GET | `/api/admin/players` | [路由与命令](../src/modules/players/admin-routes/players.ts) |
| POST | `/api/admin/players` | [路由与命令](../src/modules/players/admin-routes/players.ts) |
| POST | `/api/admin/qa` | [路由与命令](../src/modules/qa/admin-routes/qa.ts) |
| POST | `/api/admin/submissions/:id/auto-challenge` | [缓存匹配预览与建档](../src/modules/records/admin-routes/submissions-id-auto-challenge.ts) |
| POST | `/api/admin/submissions/:id/review` | [路由与命令](../src/modules/records/admin-routes/submissions-id-review.ts) |
| POST | `/api/admin/submissions/:id/reviewing` | [路由与命令](../src/modules/records/admin-routes/submissions-id-reviewing.ts) |
| GET | `/api/admin/submissions/:id` | [路由与命令](../src/modules/records/admin-routes/submissions-id.ts) |
| PATCH | `/api/admin/submissions/:id` | [路由与命令](../src/modules/records/admin-routes/submissions-id.ts) |
| POST | `/api/admin/submissions/:id/tags` | [路由与命令](../src/modules/records/admin-routes/submissions-id-tags.ts) |
| GET | `/api/admin/submissions` | [路由与命令](../src/modules/records/admin-routes/submissions.ts) |
| POST | `/api/admin/submissions` | [路由与命令](../src/modules/records/admin-routes/submissions.ts) |
| POST | `/api/admin/suggestions/:id/decide` | [路由与命令](../src/modules/suggestions/admin-routes/suggestions-id-decide.ts) |
| POST | `/api/admin/suggestions/:id/duration` | [路由与命令](../src/modules/suggestions/admin-routes/suggestions-id-duration.ts) |
| DELETE | `/api/admin/suggestions/:id` | [路由与命令](../src/modules/suggestions/admin-routes/suggestions-id.ts) |
| PATCH | `/api/admin/tasks/:id` | [路由与命令](../src/modules/admin/admin-routes/tasks-id.ts) |
| GET | `/api/admin/tasks` | [路由与命令](../src/modules/admin/admin-routes/tasks.ts) |
| POST | `/api/admin/tasks` | [路由与命令](../src/modules/admin/admin-routes/tasks.ts) |
| POST | `/api/admin/trash/:id` | [路由与命令](../src/modules/admin/admin-routes/trash-id.ts) |
| GET | `/api/admin/trash` | [路由与命令](../src/modules/admin/admin-routes/trash.ts) |
| POST | `/api/admin/trash` | [路由与命令](../src/modules/admin/admin-routes/trash.ts) |

### GET /api/submissions/campaign-suggestions

返回 `{fetchedAt,expiresAt,campaigns:[{id,name,gameBananaUrl}]}`，供新挑战地图包名称自动补全。仅包含有有效 GameBanana 地图链接的来源地图包；来源 ID 不是本站目录 ID。Goldberries 全目录由 `goldberries.cacheDirectory` 指定的本地目录缓存七天，过期整体刷新，跨进程合并并发刷新。与审核服务配置为同一目录即可复用快照。来源不可用或缓存损坏返回 503，玩家仍可手填名称和链接；选择建议不会写入正式目录。

### 新挑战缓存匹配预览

`POST /api/admin/submissions/:id/auto-challenge` 仅管理员可用。空请求体返回可编辑 `draft`、匹配说明 `notes`、来源链接、缓存地图名称建议及提案版本 `token`。尽量补全已确定的地图包、链接、地图、挑战和难度；部分匹配、未定档、超出自动难度映射或缓存不可用时仍返回申请资料供管理员补全。申请建议难度与来源难度分别说明。

确认时发送 `{confirm:true,token,draft}`，`draft` 包含 `campaignId`/`mapId`（null 表示按名称新建或复用）、`campaignName`、`mapName`、`challengeName`、`gameBananaUrl`、`type`、`tier` 和 `rules`。支持管理员选择正式 Tier、Standard 或未定档。服务端在同一事务中核验提案版本、必填字段、现有归属、重名、回收状态和链接冲突；不重新要求缓存完整匹配。成功返回 `campaignId`、`mapId`、`challengeId` 供回填，记录及标签保持原样，由审核接口最终接受。本操作不下载封面。

### `PATCH /api/players/:id/status`

仅有效登录账户本人绑定的玩家可调用，正文 `{status:"normal"|"unwilling"}`。成功返回 `{ok:true,status}`。不能修改其他玩家、回收玩家，不能自行解除 blocked。blocked 玩家提交、重新提交或被管理员补录挑战时返回 403。

### 愿望单 Ping 点

`GET /api/wishlist/ping?wishId=<id>`：有效登录账户读取本人条目的 `{ok,eligible,disabled,claimed,point,rooms}`；房间含 `sid,side,roomKey,roomName,position`。仅正式 Tier 地图挑战开放。

`POST /api/wishlist/ping`：`{wishId,point:{sid,side,roomKey}}` 保存一个点位；`point:null` 移除。玩家身份取自会话认领关系，拒绝越权、禁用、无效配对或房间。失败可返回 `pingError: disabled|ineligible|claim|invalid`。

`GET /api/admin/ping-permissions?q=<名称或ID>&page=1` 返回 `{ok,data:{players,total}}`，每页 20 人，仅列已设置 Ping 点的玩家，按已激活数降序、名称和 ID 稳定排序。`points` 为未禁用且挑战、配对有效的启用点位数，`configuredPoints` 为设置总数；已禁用玩家仍可查询以恢复权限。与 `POST /api/admin/ping-permissions {playerId,disabled}`：管理员查询及禁用/恢复玩家 Ping 点权限，写入与审计同一事务。
