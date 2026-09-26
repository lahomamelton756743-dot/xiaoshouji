# 小手机 v0.6.1

瑞安与 ChatGPT 私人使用的小手机。v0.6.1 在 v0.5.2 功能基线上继续升级，视觉保持 v0.4.1 的冰蓝 / 珍珠白 / 淡灰紫液态玻璃，不清空既有数据，也不重写已经验证通过的链路。

## 架构

- Android 原生：设备状态、媒体状态、使用情况统计、通知、来电、应用门禁、一次性来访快照等。
- WebView 前端：`android/app/src/main/assets/littlephone/index.html`。
- 云端：Cloudflare Worker + D1，代码在 `server/little-phone-cloudflare/`。
- MCP：同一个 Cloudflare Worker 暴露 `/mcp`。
- 不使用模型 API，不使用 Claude channel，不提供截图能力。

## v0.6.1 重点

- 双人身份系统：稳定 actor 键 `user` / `daddy`，显示名、头像、身份色独立可编辑并全局同步；正文不随昵称变化。
- “我们”页：状态缩为头像上方小胶囊；头像靠近；共享耳机线在下方汇合；显示动态相伴天数；右侧“一起听”读取真实 `media_state`。
- 首页：手机状态卡增加当天 App 使用前五名（含图标、名称、时长）；双方足迹卡固定可视高度，不再因长文本一高一低。
- 纸条：支持 `reply_to`，daddy 左 / user 右的液态玻璃回复气泡。
- 信箱：信封式列表、月份分组、关键词搜索、拆信详情、左右滑动上一封/下一封、回信 thread；列表不直接展示正文。
- 已拆状态：普通信和未来信升级为 `user_seen` / `daddy_seen`；MCP list/get 不会自动把 daddy 标成已拆。
- 未来信：锁定期后端不返回正文；到期后才允许读取。
- 日常册：按 `date ASC -> created_at ASC` 排序、修复时间河裁切、支持作者编辑同一 ID。
- 待办：已完成且过期进入历史；未完成且过期保留并标为“已逾期”。
- 来电：新命令使用 `trigger_call`；修正延迟来电 `scheduled_for`；历史 `trigger_guidian` 保持兼容。
- 提醒：popup 使用独立 `show_reminder_popup`，不再复用来电，也不写入 call history。
- 事件：前端节流配合后端短窗口去重，减少重复打开事件。
- 应用门禁：保留现有 lock/unlock 底层，UI 改为小手机液态玻璃；动态读取锁定者头像、名字、身份色；保留“长按 5 秒紧急解锁”；支持申请解锁理由与后端响应。
- 旧 Render 能力：新增 Cloudflare 原生 phone home/back/recents/open_app、App 列表命令，以及基于最新一次授权快照的 phone/life/senses 状态工具。

## 数据迁移

Worker 启动时会使用幂等迁移补齐 v0.6.1 字段与表，包括：

- `lp_papers.reply_to`
- `lp_mail.user_seen` / `lp_mail.daddy_seen`
- `lp_capsules.user_seen` / `lp_capsules.daddy_seen`
- `lp_profiles`
- `lp_unlock_requests`

现有 D1 继续使用，不需要为了 v0.6.1 清库或新建数据库。

## 后端测试

```bash
cd server/little-phone-cloudflare
npm test
```

当前测试覆盖普通信双已拆、纸条回复、未来信锁定、日常册原 ID 更新、profiles、门禁申请解锁、popup/call 隔离、bootstrap、待办、日期、周期兜底、删除、一次性来访、快照过期、MCP、状态、来电、延迟来电、健康桥契约、OAuth、行内图片回退与截图禁用。

## Android 构建

需要 Android SDK Platform 34 / Build Tools 34.0.0：

```bash
bash android/build.sh
```

输出：`android/LittlePhone-v0.6.1.apk`

## Cloudflare 部署

GitHub Actions 工作流：`.github/workflows/deploy-little-phone-backend.yml`

Repository Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LINJIAN_TOKEN`

默认 Worker：`little-phone-backend`。现有 D1 数据库继续沿用。

## 交付

- ZIP：`little-phone-v0.6.1.zip`
- Branch：`main`
- Commit：`Upgrade little-phone to v0.6.1`
