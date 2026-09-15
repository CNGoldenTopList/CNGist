# 新库迁移与运行维护

## 当前状态与影响

生产部署见 [部署说明](../deployment.md)。正式切换前冻结旧库写入并保留最终备份。

正式迁移采用新库：旧库保持可回退，完整关系一次转换，避免在在线表上直接替换 UUID 主键。新库与旧库可在同一个 PostgreSQL 实例中，但应分别设置数据库及拥有者。

数字 ID 会改变 API 字段类型和详情链接。前端收藏、管理脚本、机器人查询需要一起适配。数据库内的收藏与任务链接由导入脚本转换；浏览器本地存储、外部书签和第三方客户端需要消费映射表或重新加载。数据库中的映射表不会自动提供旧 URL 重定向。

## 1. 准备新库

创建独立数据库及拥有者，将根目录 `config.json` 的 `database.url` 指向新库，完成 `npm install` 后运行：

```bash
npm run db:migrate
npm run db:check
```

新库只允许有初始 Tier 字典；导入脚本拒绝覆盖已有业务数据和重复导入。完整初始结构只有 `backend/drizzle/0000_initial.sql` 一份 SQL。

另在仓库外创建权限为 `600` 的源库连接配置，例如 `/secure/cngist-source.local.json`：

```json
{"database":{"url":"postgresql://READ_ONLY_USER:PASSWORD@127.0.0.1:5432/OLD_DATABASE"}}
```

源库账号应仅有读取权限。脚本另外使用 `REPEATABLE READ READ ONLY` 事务获得一致快照，不执行源库更新；源与目标为同一数据库时拒绝运行。

## 2. 准备图片索引

旧地图包和地图的每个非空 banner 必须对应已上传到目标 OSS/CDN 的对象。准备 JSON 清单 `/secure/cngist-assets.local.json`：

```json
{
  "/covers/example.png": {
    "objectKey": "catalog/example.png",
    "contentType": "image/png",
    "bytes": 12345
  }
}
```

键必须与旧库 banner 原值一致，可能是完整 URL 或本地路径。清单应覆盖所有保留行（含回收内容），不能猜测中文名称或用近似文件替代。缺少封面映射会中止整次导入。脚本不会下载图片或验证对象实际可读，运行者需先验证 CDN 返回正确内容。

旧反馈附件已有 object_key，导入时沿用对象索引；目标 OSS 必须能读取对应对象。头像是可重建缓存，清单中有旧 URL 映射时保留，否则清空缓存图片，后续按玩家档案 UID 更新。

不要通过目标站的图片上传 API 预填目标库：导入要求目标业务表为空。可用 OSS 工具直接准备对象和清单。

## 3. 演练与正式导入

下列命令从仓库根目录执行，参数路径用绝对路径。默认预览只向目标事务试写，完成完整性检查后回滚：

```bash
npm run db:import-source -- --source-config /secure/cngist-source.local.json --assets /secure/cngist-assets.local.json
```

预览确认后，在空新库正式导入：

```bash
npm run db:import-source -- --source-config /secure/cngist-source.local.json --assets /secure/cngist-assets.local.json --apply
npm run db:check
```

一次导入以目标事务整体提交或回滚。PostgreSQL 序列不随事务回滚，预览可留下空号，不能依赖预览 ID；正式结果及 `migration_id_map` 才是对应关系。

脚本按当前旧后端 PostgreSQL 表结构转换，不读取历史快照文件。转换包含：

- 所有实体旧主键与普通外键；原有组合关系表新建自增主键。
- 账户认领、JSON 收藏、回收目标、审核人、设备同步关联。
- 密码摘要、会话及设备令牌摘要、有效期和撤销状态。
- 设备旧 UUID 保存为 external_id，协议 dataset/epoch/mutation 等不重编号。
- 部分任务和反馈中的已知站内详情路径；审计原文保持原样。
- 图库索引、软删除和记录状态；Tier code/rank/正式属性必须与初始字典一致。

报告列出导入表行数与映射数量。源库 Tier 不匹配、外键缺失、挑战跨图关系、回收引用异常或 DAG 成环都会阻止提交，不自动修补正式数据。

`db:check` 检查自增数字 ID、已验证约束、回收目标及 DAG。仍需对照报告核验源目标行数、已通过/隐藏/回收记录、正式 Tier 分布、FC 标签及挑战和玩家抽样。演练结果不能代替最终写入冻结后的快照。

## 4. 正式切换顺序

1. 完成新前端、管理脚本和机器人对数字 ID 的适配，在预发布域名验证登录、提交、审核、图片和 Mod 同步。
2. 进入维护窗口，冻结旧站所有写入口，包括玩家提交、管理操作、机器人和 Mod 上传；保留读取或显示维护页。
3. 对旧库做最终备份，向另一个空新库重新导入最终只读快照并核对数据。演练库不要直接当最终库。
4. 验证新后端、新前端、反向代理同源配置、OIDC 回调、CDN、设备与机器人，再切流量并逐步开放写入。
5. 观察错误、登录与上传状态，保留旧库和最终备份，启用新库备份定时任务。

会话和设备令牌在导入时保留，有效凭据可继续使用；Cookie 能否沿用还依赖域名、路径和有效期，不能保证跨域迁移免登录。Mod 的协议设备 UUID 保留，但返回地图/挑战 ID 变为数字，仍须与实际客户端做兼容验证。

若尚未开放新库写入，可切回旧服务与旧库。新库接受写入后不能直接回退，否则会遗漏新增数据；应先冻结写入，导出新库增量并完成对账/回迁，再恢复旧服务。本方案不做双写或自动增量同步。

## 备份与恢复

```bash
npm run backup
```

输出 PostgreSQL custom 格式备份到 `backup.directory`（默认 `backups/`），目录已忽略。备份成功并原子改名后才清理超期副本，默认保留 14 天。不配置多机器或远程容灾。

主机需有匹配版本的 `pg_dump`/`pg_restore`；若工具位于本机容器，设置 `database.toolsContainer` 为容器名。数据库主机名需在执行工具的环境中可达。凭据通过子进程环境传递，不进入命令行。

恢复时创建另一个空库，将 `config.json` 暂时指向它（不要先执行 db:migrate），运行：

```bash
npm run db:restore -- /绝对路径/postgres.dump
npm run db:check
```

恢复拒绝非空 public/drizzle 表，使用单事务恢复。恢复后核验行数、引用和登录样本；还原配置后再启动正常服务。备份本身不包含 OSS 图片。

备份可通过部署者选择的定时任务运行 `npm run backup`。确认目标数据库与备份目录后再启用调度，并定期进行恢复演练。
