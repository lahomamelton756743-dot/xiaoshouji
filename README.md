# 小手机 v0.5.2

瑞安与 ChatGPT 私人使用的小手机。视觉继续以 v0.4.1 的冰蓝 / 珍珠白 / 淡灰紫液态玻璃为母版，功能结构沿 v0.5 系列继续收口。

## 当前架构

- Android 原生：设备状态、位置/天气、使用情况统计、通知、来电/主动提醒、应用门禁等。
- WebView 前端：`android/app/src/main/assets/littlephone/index.html`。
- 云端：Cloudflare Worker + D1，代码在 `server/little-phone-cloudflare/`。
- MCP：同一个 Cloudflare Worker 暴露 `/mcp`；正式 ChatGPT 插件等 v0.5.2 真机功能稳定后再创建。
- 小米健康：v0.5.2 先固定前端、后端和 MCP 数据契约，真实 `mi-fitness-python` 健康桥最后接入；未连接时明确返回 `health_source_not_connected`，不造假数据。
- 不使用模型 API，不使用 Claude channel，不提供截图能力。

## v0.5.2 页面结构

### 首页

1. 时间 / 天气主卡（顶部）
2. 今天 / 待办
3. 手机状态与使用情况（横向整行）
4. 瑞安足迹 + daddy 足迹

首页不再放双头像关系卡。

### 留痕

- 顶部左侧：纸条 / 纸条箱入口。
- 顶部右侧：daddy 来电记录（来电、接通、拒绝、留言等）。
- 下方：横向可滑动、弯曲如河流的日常册时间河。
- 原“双方小手机事件时间轴”不再占据留痕页。

### 我们

- 进入页面时双头像会轻轻靠近、碰一下，再贴近停住；中间保留弯曲耳机线。
- 头像右侧为双方状态区：瑞安状态 / 细分割线 / daddy 状态；状态有在线、稍后回来、安静中三种轻状态。
- 双方状态可编辑，daddy 状态也预留 MCP 修改工具。
- 纪念日没有近期事项时回退显示“我们在一起第 N 天”等已有记录。
- 日记入口进入书式日记页：封面 → 一篇一页 → 等尺寸翻页按钮 → 单页长文纵向滚动/阅读进度。
- 小米健康入口优先展示睡眠，再展示步数、心率；未接健康桥时明确显示未连接。

## 来电（原“归电”）

- 自定义来电名称、副标题、来电文案。
- 头像跟随“小手机 → 我们”中设置的 daddy 头像。
- 接通后可跳转到用户填写的 Android 软件包名；留空则只接通。
- 拒绝后可留言。
- 支持延迟若干分钟后再次来电；每次来电文案可由 daddy 自定义。
- 所有来电记录同步到留痕页的来电记录区域。
- 保留来电间隔、冷却、每日次数、安静时段、本地主动提醒等配置。

## 其他能力

- 纸条箱：双方可写、洗牌袋轮播、支持删除。
- 信箱：普通信 + 未来信 / 时间胶囊，支持删除。
- 日常册：文字、心情、日期、照片、展开详情与删除。
- 待办：新增、修改、完成、删除、到期时间、提醒时间。
- 纪念日 / 重要日期：月历、新增、修改、删除、提前提醒；“第 N 天”从关系起始日读取。
- 旧周期记录仍作为本地兜底数据保留，但首页 / 我们页主组件已由“小米健康”替代。
- 设备权限：UI 与 Android 实际权限入口联动。
- 主动提醒：低电、充好电、喝水、休息、屏幕时间、本地通知。
- 应用门禁：选择已安装 App 或按包名配置并锁定 / 解除。
- 来访：一次触发只读取一次授权快照，30 分钟过期；失败不留痕。
- 离线缓存：本地优先，server 暂时不可达时不把旧内容渲染成“被清空”。

## v0.5.2 新后端契约

新增：

- `GET/POST /api/littlephone/statuses`
- `GET/POST /api/littlephone/calls`
- `POST /api/littlephone/calls/delete`
- `GET/POST /api/littlephone/health-summary`

MCP 新增契约：

- `set_little_phone_status`
- `get_little_phone_statuses`
- `call_little_phone`
- `list_little_phone_calls`
- `get_health_summary`
- `get_sleep_summary`

其中健康工具在真实小米健康桥尚未接入时返回 `health_source_not_connected`。

## 后端部署

GitHub Actions 工作流：`.github/workflows/deploy-little-phone-backend.yml`

Repository Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LINJIAN_TOKEN`

默认 Worker：`little-phone-backend`

现有 D1 继续使用：`little-phone-v051`

v0.5.2 不需要另建数据库；Worker 启动时会用 `CREATE TABLE IF NOT EXISTS` 自动增加状态、来电记录与健康摘要表。

## 测试

```bash
cd server/little-phone-cloudflare
npm test
```

测试覆盖信、纸条、未来信、日常册、daddy 日记、待办、重要日期、旧周期兜底、删除、双方状态、来电记录、延迟来电、健康桥契约、bootstrap、一次性来访、失败不留痕、快照过期、MCP、设备动作白名单、D1 行内照片回退与截图禁用。

Android 构建需要 Android SDK Platform 34 / Build Tools 34.0.0：

```bash
bash android/build.sh
```

输出：`android/LittlePhone-v0.5.2.apk`
