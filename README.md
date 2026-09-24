# 小手机 v0.5.1 后端（Cloudflare Worker + D1 + MCP）

这是“小手机”自己的后端，不再把 v0.5.1 的信、纸条、待办、日常册请求打到旧掌心窗接口。

## 这一版已经具备

- 信箱：普通信 + 已拆/未拆
- 未来信 / 时间胶囊：到日期前不返回正文
- 独立纸条箱
- 留痕：每条独立 7 天过期
- 日常册：长期保存，供横向时间河读取
- 待办：新增 / 修改 / 完成
- daddy 来访：只排队一次 `little_phone_visit`
- Android 成功回传后保存 30 分钟快照
- 来访失败不产生来访留痕
- MCP：与 HTTP API 在同一个 Worker 内
- 截图相关路由永久返回 410，不提供截图能力
- D1 表自动创建；可复用旧 D1，不会覆盖旧表，全部使用 `lp_*` 表名

## 推荐部署方式：新 Worker，复用旧 D1 + 旧 Token

这样测试最安全：旧掌心窗先不动，小手机接一个新的 Worker。

新 Worker 根地址类似：

`https://little-phone-backend.<你的 workers.dev 子域>.workers.dev`

小手机「我们 → 连接设置」填写 **根地址**，不要加 `/mcp`。

之后新插件 / MCP 使用：

`https://little-phone-backend.<你的 workers.dev 子域>.workers.dev/mcp`

两边使用同一个 `LINJIAN_TOKEN`。

## GitHub Actions 一键部署

包里已经带：`.github/workflows/deploy-little-phone-backend.yml`

仓库 Settings → Secrets and variables → Actions 需要这 3 个 Repository secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LINJIAN_TOKEN`

如果前两个以前部署 Cloudflare 时已经有，不需要重复创建。`LINJIAN_TOKEN` 建议直接沿用掌心窗现在那一个，手机就不用记两套 Token。

然后：Actions → `部署小手机后端 v0.5.1` → Run workflow。

默认：

- Worker 名：`little-phone-backend`
- D1 名：`linjian-peek`

工作流会自动从 Cloudflare 查这个 D1 的 database_id，不需要你手填 ID。

## 部署后第一轮测试

先浏览器打开：

`https://你的新 Worker/health`

应该看到：

- `ok: true`
- `version: 0.5.1-little-phone`
- `screenshot: false`

然后小手机连接设置里填：

- server：`https://你的新 Worker`（根地址）
- token：原 `LINJIAN_TOKEN`
- device id：`android-phone`（如果你之前没自定义）

测试顺序建议：

1. 在小手机写一封信。能写入且重开仍存在。
2. 写一张纸条。首页/纸条箱应能读回。
3. 新增一个待办，再完成它。
4. 写一条纯文字日常册记录。
5. 再测试 daddy 来访：MCP 调 `visit_little_phone` → Android 下次轮询只采一次 → `/api/device/report` 回传 → `get_little_phone_snapshot` 读取。
6. 超过 30 分钟的快照会返回 `上次快照已过期`；不会伪装成当前状态。

## 日常册照片

文字功能不需要额外服务。照片接口已经预留 R2：如果以后绑定 `LITTLEPHONE_MEDIA`，App 上传的本地照片会进 R2；当前没绑定 R2 时，文字日常册照常工作，本地图片会被跳过并返回 warning。这样先测试核心链路，不会因为照片存储卡住。

## 本地测试结果

`server/little-phone-cloudflare/test.mjs` 使用真实 SQLite SQL 模拟 D1，已经覆盖：

- 写信 / 读信 / 拆信
- 纸条箱
- 未来信锁定
- 日常册文字
- 待办新增 / 修改 / 完成
- 一次性来访
- 成功来访写留痕
- 失败来访不留痕
- 30 分钟快照过期标记
- MCP initialize / tools/list / tools/call
- 截图接口禁用

运行：

```bash
cd server/little-phone-cloudflare
npm test
```
