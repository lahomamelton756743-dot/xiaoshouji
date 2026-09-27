# 小手机 v0.7.2

**Stable lineage: v0.6.3 → rebuilt v0.7.1 → v0.7.2.** 本版继续沿用从最后稳定 `little-phone v0.6.3` 重建出的稳定数据链，不使用失败旧 0.7.x 的 bootstrap / API client / 数据读取方案。

## 数据与后端原则

- 正式后端仍是 `server/little-phone-cloudflare/`，继续绑定原有 D1、Worker secrets、API base URL 和 token/header。
- `papers / mail / capsules / calls / todos / statuses / diaries / dailybook / dates / profiles / memories` 保留现有数据和读取链路；不清库、不用空库替代旧库。
- `lp_memories` 继续作为“{daddy.display_name} 记得”的唯一数据表。v0.7.2 只是补齐可直接调用的 MCP CRUD/确认/纠错工具名。
- 小米健康新增 `lp_health_daily` 作为按日期历史摘要表；原 `lp_health_summary` 继续保留，不替换、不删除。
- `lock_app / unlock_app / trigger_call / open_app` 和 Android command dispatcher 继续沿用稳定实现。
- 旧本地 MCP/Render 网关仍明确 deprecated，不存在静默 fallback。

## v0.7.2 视觉与交互

- 普通信未拆时为封好的纸质信封 + 火漆封缄；拆开后为真实纸张感长信纸，带 FROM / DATE、称呼、正文、署名与日期。
- 身份字体真正分别保存为 `user.identity_font` / `daddy.identity_font`；新增轻斜体和花体感选项。没有捆绑商业“奶酪体”，奶酪感明确使用系统圆润字体近似。
- 首页 `Together` 改为更轻、更横向的手写主视觉；相伴数字使用更优雅的衬线数字。
- “一起听”使用纵向音柱组成的心形波形；歌曲名、歌手/来源有明确文字层级，播放时轻微动态、暂停时静止。
- 首页完整月历不再显示常驻标记 legend；点日期后只保留标记种类、备注、标记者，颜色自动跟随身份色。
- 背景图改为全局/五页面分别持久化，避免一份超大 JSON；玻璃卡片降低不透明度，让背景真实透出。
- 天气时间组件略收短，团雀月亮扩大，留言使用 daddy 身份字体并按天气、温度、时间变化。
- 纸条箱改成纸张主体；回复输入和删除/回复操作降权，纸条正文成为视觉主角。

## “记得” MCP

v0.7.2 新增直接可发现的工具名：

- `list_memories`
- `create_memory`
- `update_memory`
- `confirm_memory`
- `correct_memory`
- `delete_memory`

这些工具全部读写原 `lp_memories`。更新、确认、纠错都保留原 ID。

## 小米运动健康 / 小米手环

`server/health-bridge/` 是独立 Python 3.11+ Bridge。小米 token 只保留在 Bridge 服务器，不进入 Android、前端或 D1。

数据流：

```text
小米运动健康
  → mi-fitness-python（小号 token + 亲友共享）
  → Xiaomi Health Bridge
  → Cloudflare Worker
  → D1 最新摘要 + 按日期历史
  → 小手机状态页 / MCP
```

Cloudflare MCP 支持：

- `get_health_summary(date?, refresh?)`
- `get_sleep(date?, refresh?)`
- `get_heart_rate(date?, refresh?)`
- `get_steps(date?, refresh?)`
- `refresh_health_data(date)`

Bridge 兼容 `GET /health?date=YYYY-MM-DD&type=all`，也保留 `/query` 与 `/sync`。具体亲友授权、token 生成和部署见 `server/health-bridge/README.md`。

## 版本

- `versionName = 0.7.2`
- `versionCode = 70320`
- APK 目标名：`LittlePhone-v0.7.2.apk`
- ZIP：`little-phone-v0.7.2.zip`
- Branch：`main`
- Commit：`Build little-phone v0.7.2 with Xiaomi health and UI refinements`

## 推荐部署顺序

1. 备份当前 Worker/D1 配置；不要删除原 D1。
2. 先部署 `server/little-phone-cloudflare/` 到原 Worker，并继续绑定原 D1/secrets。
3. 运行 Worker 回归测试，确认 `/health` 返回 `0.7.2-little-phone`，并确认旧纸条/信/待办等仍能读取。
4. 需要小米健康时，再独立部署 `server/health-bridge/`；先在 Bridge 上验证某一天的睡眠、心率、步数，再配置 Worker 的 Bridge URL/secret。
5. 最后构建/安装 Android APK，真机检查 UI、字体、背景和 `LittlePhoneHTTP`。

## 本地验证

```bash
node --check server/little-phone-cloudflare/worker.js
node --check server/little-phone-cloudflare/test.mjs
node server/little-phone-cloudflare/test.mjs
node --check mcp/server.js
python -m py_compile server/health-bridge/app.py
bash -n android/build.sh
```

前端内联 JS 需提取后执行 `node --check`。Android 网络问题统一查看 Logcat tag `LittlePhoneHTTP`；记录 endpoint、真实 URL、HTTP code、response 前缀和 JSON parse error，但不记录 token。
