# CNGoldenLink 公共路线库

本地控制台 `/routes` 编辑当前游戏地图的 CCT segment，保存后默认公开上传路线和地图调试地形。下载始终追加为新的本地 segment 并选中，不覆盖原路线，不自动再次分享；修改下载的路线后保存，分享记录保留来源。

公共路线库与 `tracker_cct_scope` 的个人统计快照分开。不开启任何个人统计的公开读取；仅返回作者显示名、路线、来源、地图 SID/面、时间和调试地形。地图可以尚未收录，不要求金榜地图绑定。

## 部署

先合并本 PR，再在服务器执行：

```bash
git pull --ff-only
npm install
npm run db:migrate
npm run build
# 按 docs/deployment.md 重启现有后端服务
```

`0007_shared_routes` 是新增表迁移，不重写旧 CCT 数据。服务沿用根目录 `config.json` 中的 `database.url`，HTTP 反向代理的请求体上限应至少为 **9 MiB**（接口本身也限制并验证大小）。部署服务端后再安装包含路线编辑器的 CNGoldenLink 测试包。旧版客户端不受影响；新版客户端遇到旧服务器时本地保存仍可用，云端请求报错并保留待上传内容。

内部表使用数字 `id`、账户／设备／来源数字外键；`external_id` 是客户端签发的 UUID 同步标识。以下 API 的 `id` 和 `sourceId` 均为公开同步标识，不返回内部数字主键。

## 协议

- `GET /api/tracker/routes?sid=…&side=Normal|BSide|CSide&offset=0`：公共列表，每页 20 项，按更新时间和 ID 排序；`nextOffset` 为 null 时结束。可选设备 Bearer 用于计算 `owned`，不返回账户和设备 ID。
- `GET /api/tracker/routes/{id}`：公共详情，含 `route` 和 `terrain`；已删除或作者停用返回 404。
- `POST /api/tracker/routes`：现有设备 Bearer 认证。`action: publish` 上传；`action: delete, id` 删除本人分享。

上传字段：`action, id(UUID), revision(正整数), sid, side, sourceId(UUID|null), route, terrain`。路线 ID 由本地持久索引签发，修订号递增；同设备、同 ID、相同 revision 和内容重试幂等，旧修订或同修订不同内容拒绝。跨设备不能覆盖原设备的分享，下载到另一台机器后另建分享并标注来源。删除允许账户本人任一有效设备操作。

`route`：

```json
{
  "name": "全程",
  "checkpoints": [{
    "name": "Start", "abbreviation": "ST",
    "rooms": [{"debugRoomName":"a-01","customRoomName":null,"isNonGameplayRoom":false,"groupedRooms":[],"difficultyWeight":-1}]
  }],
  "ignoredRooms": [],
  "trackWingedGolden": false
}
```

`terrain` 是所有本机地图房间的数组。每项包含 `name,x,y,width,height,color,dummy,solids,backs,spawns,berries,checkpoints,jumpthrus`。位置和尺寸采用 Celeste `LevelTemplate` 的 8 像素 tile 坐标；矩形数组元素为 `[x,y,width,height]`，点数组为 `[x,y]`，均相对房间。颜色为 `#rrggbb`。与 CCT 的调试地图一致，展示前景、背景实体地形、复活点、草莓、检查点和单向平台，不上传游戏贴图、统计、存档或实体脚本。

每个发布 payload 上限 8 MiB，每路线最多 2000 节点／CP、每节点 100 个合并房间、每地图 2000 房间、20 万个地形图元。每账户总 payload 上限 32 MiB，含删除标记最多 1000 条。所有房间引用必须存在于该 payload 的地形中，实际应用时 Mod 再检查本机地图的房间。

删除保留无 payload 的 tombstone，防止旧队列把已删除分享复活；本机删除成功后更换分享 ID。关闭自动上传只停止自动队列，不删除公开分享，手动上传仍可用。关闭金榜连接停止所有上传。上传失败不撤销本地编辑，队列跨游戏重启保存，网络／认证错误退避重试；冲突与内容错误需要用户处理。

## 验证

```bash
npm run test:routes -w backend
npm test
npm run build
```

路线测试用 PGlite 执行全部 Drizzle 迁移，验证实际 SQL 的公开字段、作者权限、修订冲突、幂等重试、撤权、来源、删除标记、分页和配额。Mod 仓库另包含真实 CCT 模型往返、持久队列与浏览器交互测试。
