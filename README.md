# 小手机 v0.5.1

瑞安与 ChatGPT 私人使用的小手机。当前版本以 v0.4.1 的液态玻璃视觉为母版，保留并继续完善 v0.5 的功能结构。

## 当前架构

- Android 原生：设备状态、位置/天气、使用情况统计、通知、主动提醒、应用门禁等。
- WebView 前端：`android/app/src/main/assets/littlephone/index.html`。
- 云端：Cloudflare Worker + D1，代码在 `server/little-phone-cloudflare/`。
- MCP：由同一个 Cloudflare Worker 暴露 `/mcp`。正式 ChatGPT 插件等本轮功能稳定后再创建。
- 不使用模型 API，不使用 Claude channel，不提供截图能力。

## v0.5.1 当前功能

- 首页：可编辑双头像/名字、弯曲耳机线、时间天气、手机状态/使用时间、随机纸条、最近 3–4 条留痕、今天待办。
- 留痕：7 天逐条独立过期，固定高度滚动区；下半部分为横向可滑动的弯曲日常册“时间河”。
- 纸条箱：独立于信箱，双方可写，洗牌袋轮播，支持删除。
- 信箱：普通信 + 未来信/时间胶囊，支持删除。
- 日常册：文字、心情、日期、照片、展开详情与删除；未配置 R2 时，小尺寸压缩照片可直接存 D1。
- 待办：新增、修改、完成、删除、到期时间、提醒时间。
- 纪念日/重要日期：月历、新增、修改、删除、提前提醒；“第 N 天”从关系起始日读取。
- 生理周期：设置、历史记录、修改/删除、预计日期与提醒。
- 设备权限：UI 开关与 Android 实际权限入口联动；位置授权后可主动刷新天气。
- 主动提醒：低电、充好电、喝水、休息、屏幕时间、本地通知与明显弹窗。
- 应用门禁：从已安装 App 中选择并锁定/解除；需要相应 Android 系统权限。
- 来访：一次触发只读取一次授权快照，30 分钟过期；失败不留痕。
- 离线缓存：最近一次成功同步内容保存在本机 SQLite，网络失败时不再伪装成“数据被清空”。

## 后端部署

GitHub Actions 工作流：`.github/workflows/deploy-little-phone-backend.yml`

Repository Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LINJIAN_TOKEN`

默认 Worker：`little-phone-backend`
默认 D1：`little-phone-v051`

当前生产地址由用户自己的 Cloudflare 账户决定。App 的连接设置填写 Worker 根地址，不加 `/mcp`；ChatGPT 插件以后连接同一地址的 `/mcp`。

## 测试

```bash
cd server/little-phone-cloudflare
npm test
```

测试覆盖信、纸条、未来信、日常册、待办、重要日期、周期记录、删除、一次性来访、失败不留痕、快照过期、MCP、设备动作白名单、D1 行内照片回退与截图禁用。

Android 构建需要 Android SDK Platform 34 / Build Tools 34.0.0：

```bash
bash android/build.sh
```

输出：`android/LittlePhone-v0.5.1-r4.apk`

## v0.5.1 R3 hotfix

- 原生头像选择器，修复 WebView 头像无法更换；头像略放大。
- 本机留痕待同步队列：server 临时断开时不再“什么都没发生”。
- 离线条显示具体连接错误并可点击重试。
- 连接地址自动纠正常见的 `/mcp`、`/health` 误填。


## v0.5.1 R4

- 修复写纸条/写信/纪念日/周期保存时前端先于 Android HTTP 返回而误报 timeout：原生连接/读取超时缩短并确保错误立即回调，前端等待窗口重新匹配。纸条、信、纪念日和周期记录在网络异常时会先保存在手机，连接恢复后自动同步；创建请求带客户端 ID，重试不会重复写入。
- 首页同步改用 `/api/littlephone/bootstrap` 一次拉取核心数据，减少移动网络同时请求过多导致的超时；旧后端仍可自动回退兼容。
- 弹窗使用动态层级栈：从纸条箱再打开“写纸条”时，编辑弹窗始终在最上层；点击遮罩区域可关闭。
- Android 手势返回优先关闭最上层弹窗/返回上一个小手机页面，首页才退出 App。
- “归电与提醒”加入归电间隔、冷却时间、每日次数、安静时段等配置；归电来电页头像跟随“小手机 → 我们”中设置的 daddy 头像。
- “我们”中的“时间胶囊”入口替换为“日记”。新增 daddy/GPT 私人日记页：独立封面，一篇一页，上一页/下一页翻阅，正文区域带纵向滚动进度条。未来信仍保留在信箱。
- Cloudflare 后端新增 `lp_diaries`、日记 CRUD、bootstrap 聚合接口及对应 MCP 日记工具。
