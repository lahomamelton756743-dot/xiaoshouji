# 小手机 v0.5.1 后端（全新部署版）

这一包用于完全从零部署，不依赖旧掌心窗 Worker、旧 D1 或旧 Token。

## 新建资源

推荐固定使用：

- Worker：`little-phone-backend`
- D1：`little-phone-v051`
- Token：新建一串，只给小手机 App、Worker 和之后的新 MCP 插件使用

GitHub Actions 工作流会：

1. 检查三个 Repository secrets；
2. 查找 `little-phone-v051`；
3. 如果不存在，自动创建全新 D1；
4. 部署 `little-phone-backend` Worker；
5. 把 GitHub 的 `LINJIAN_TOKEN` 写进 Worker secret。

## GitHub Repository secrets

Settings → Secrets and variables → Actions → New repository secret，建立：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LINJIAN_TOKEN`

不要把真实 Token 写进仓库文件。

## Cloudflare API Token 权限

因为第一次部署需要新建 Worker 和新建 D1，API Token 需要允许创建/部署 Workers，并允许 D1 写入/创建。建议只限制到你自己的 Cloudflare account。

## 部署

Actions → `部署小手机后端 v0.5.1（全新）` → Run workflow。

默认保持：

- Worker 名：`little-phone-backend`
- D1 名：`little-phone-v051`

## 部署后

Worker 根地址类似：

`https://little-phone-backend.<你的 workers.dev 子域>.workers.dev`

小手机连接设置：

- Server：上面的根地址，不加 `/mcp`
- Token：GitHub Secret `LINJIAN_TOKEN` 的同一串值
- Device ID：`android-phone`

以后新 MCP 插件地址：

`https://little-phone-backend.<你的 workers.dev 子域>.workers.dev/mcp`

## 测试

先访问：

`https://你的 Worker/health`

再测试：写信 → 纸条 → 待办 → 日常册 → daddy 来访。
