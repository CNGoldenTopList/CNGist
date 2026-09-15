# 部署

需要 Node.js 22+、PostgreSQL 16+。使用 `config.example.json` 创建根目录
`config.json`，填写数据库与可选集成配置，限制文件读取权限且不提交凭据。

```bash
npm install
npm run build
npm run build:frontend
npm start
```

后端运行 `backend/dist/server.js`，前端产物为 `frontend/dist/`，可由静态服务器提供。
进程管理器、静态目录位置、反向代理与发布脚本由部署者选择和维护。

## 同源路由

- `/api/` 下的请求转发到后端，保留请求方法、查询参数和请求体。
- `/health` 为后端健康检查。
- `/api` 本身是前端文档页，需要精确匹配，避免自动跳转到 `/api/`。
- 前端页面路由回退到 `index.html`；缺失静态资源应返回 404。
- `index.html` 应重新验证缓存；带 hash 的构建资源可长期缓存。

`server.origin` 使用实际站点源地址，OIDC 回调需与身份提供方配置一致。
`trustProxy` 只允许实际可信的代理地址，代理须正确设置并覆盖转发头。
发布时先提供新静态资源，再替换 HTML 入口，避免缓存页面找不到旧资源。

QQ bot 是独立进程，见 [机器人说明](../qqbot/README.md)。
数据库迁移、备份及恢复见 [运行维护](operations/migration.md)。
备份频率、调度方式和保留位置由部署者决定；恢复前必须核验目标库。
