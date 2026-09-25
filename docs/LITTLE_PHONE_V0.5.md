# 小手机 v0.5｜融合版第一轮

基线：v0.4.1 fusion assets fix。

## 本轮已实现

- 首页双头像固定：daddy 左，瑞安右；中间透明连接线，最近来访时有流光。
- 被动轮询不再周期性读取/上传 LifeState。
- MCP `visit_little_phone` 下发一次性 `little_phone_visit`；Android 按权限读取一次快照。
- 来访快照默认 30 分钟有效，过期明确标记，不能冒充当前状态。
- 来访失败不写入 v0.5 留痕；成功才写 `daddy 来访`。
- 新留痕为事件时间轴，双人左右布局，单条独立保存 7 天滚动过期。
- 新增纸条池，首页随机轮播；客户端记录本轮已播放 ID，尽量一轮内不重复。
- 信箱与时间胶囊保留 v0.4 接口。
- 新增长期日常册（标题、心情、日期、正文、最多 9 图）。
- 新增待办数据和 MCP 写入工具。
- “我们”页加入来访权限开关；位置首版只读已保存城市，不主动请求 GPS 坐标；通知不返回正文。

## v0.5 MCP 新工具

- `visit_little_phone`
- `get_little_phone_snapshot`
- `list_little_phone_events`
- `leave_little_phone_paper`
- `list_little_phone_papers`
- `add_dailybook_entry`
- `list_dailybook_entries`
- `add_little_phone_todo`
- `list_little_phone_todos`
- `set_little_phone_todo_done`

## 兼容

旧 `/api/mail`、`/api/capsules`、`/api/traces` 与原 MCP 工具保留，不做破坏性迁移。
