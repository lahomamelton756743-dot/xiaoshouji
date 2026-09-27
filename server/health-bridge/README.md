# 小米运动健康 Bridge · v0.7.3

这个目录把小米运动健康数据接到现有“小手机”Cloudflare 后端。Android 和 ChatGPT MCP **不直接持有小米 token**。

数据流：

```text
小米运动健康
  → mi-fitness-python（Python Bridge）
  → Cloudflare little-phone `/api/littlephone/health-summary`
  → 小手机 UI / MCP `get_health_summary` / `get_sleep` / `get_heart_rate` / `get_steps`
```

## 前提

按用户提供的教程，`mi-fitness-python` 通过“小米小号 + 亲友共享”读取主账号数据：

1. Python 3.11+ 环境安装/同步 `Misty02600/mi-fitness-python`。
2. 用小号二维码登录并得到本地 token 文件。
3. 小米小号在“小米运动健康”里添加主账号为亲友。
4. 主账号同意睡眠、心率、步数共享。
5. 把主账号 UID 配到 `MI_FITNESS_TARGET_UID`。

> 该 SDK 不能直接用当前账号查询自己；要使用小号 token 查询已授权的亲友 UID。

## 配置

复制 `.env.example`，通过服务器 Secret/环境变量填写真实值。不要把真实 token、UID 或 `LINJIAN_TOKEN` 提交到 GitHub。

- `MI_FITNESS_TOKEN_FILE`: `mi-fitness-python` 扫码登录后保存的 token 文件路径。
- `MI_FITNESS_TARGET_UID`: 被授权亲友（主账号）的 UID。
- `LITTLE_PHONE_URL`: 当前 Cloudflare Worker。
- `LINJIAN_TOKEN`: 小手机后端 Token，仅服务端保存。
- `HEALTH_BRIDGE_TOKEN`: 可选；保护 Bridge 的带日期 `/health`、`/query`、`/sync`。

## 启动

先确保当前 Python 环境能 `import mi_fitness`，再安装本目录依赖：

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8788
```

如果按上游项目使用 `uv sync`，可以在同一虚拟环境启动本 Bridge。

## API

- `GET /health`: 不带 `date` 时只返回连接诊断；不会返回 token 内容。
- `GET /health?date=YYYY-MM-DD&type=all`: 按教程兼容形式查询并规范化睡眠、心率、步数，不上传。`type` 也可以是 `sleep`、`heart_rate`、`steps`。
- `GET /query?date=YYYY-MM-DD&type=all`: 与上面的按日期查询等价，作为显式查询别名保留。
- `POST /sync?date=YYYY-MM-DD`: 查询后推送到 Cloudflare。

若设置了 `HEALTH_BRIDGE_TOKEN`，调用带日期的 `/health`、`/query` 和 `/sync` 时需带 `X-Bridge-Token`。

同步到 Cloudflare 时，v0.7.3 会同时更新“最新摘要”和按日期保存的 `lp_health_daily`。这是一张新增表，不改写旧健康摘要表，也不清理历史 D1 数据。

建议用定时任务每天早晨和 App 需要刷新时调用 `/sync`。小米 token 过期时 Bridge 会把 Cloudflare 健康源标成未连接，避免继续把旧数据冒充当前数据。

## 安全

- 小米 token 只存在 Bridge 服务器本地文件，建议权限 `chmod 600`。
- token 不返回给前端/MCP，也不写进 D1。
- 默认只同步摘要，不长期上传完整心率时间序列。
- 二维码登录/重新授权在 Bridge 服务器侧完成。


## Cloudflare 主动刷新（v0.7.3）

如果希望 ChatGPT 在查询某一天时主动向 Bridge 拉取，而不是只读定时同步的数据，在 Cloudflare Worker 中额外配置：

- `XIAOMI_HEALTH_BRIDGE_URL`: Bridge 的 HTTPS 地址，例如 `https://health.example.com`。
- `XIAOMI_HEALTH_BRIDGE_TOKEN`: 与 Bridge 端 `HEALTH_BRIDGE_TOKEN` 相同，使用 Worker secret 保存。

配置后，MCP `get_health_summary / get_sleep / get_heart_rate / get_steps` 都接受 `date` 和 `refresh`。`refresh=true` 时会先通过 Bridge 查询指定日期，再写入 D1 的 `lp_health_daily`；也可以显式调用 `refresh_health_data(date)`。Bridge 地址和 token 都不会发给 Android 或前端。
