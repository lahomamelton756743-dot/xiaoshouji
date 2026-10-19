# 梦 / Dream — 归栖开发记录

开发分支：`feature/dream-app`（基于 `feature/v0.8.5-memory-sea`，不要向 main 直接部署）。

## 当前实现
- `dream-engine.mjs`：35% 梦种判定、5% 锚点回归、2.5% 怪梦标记、醒后按清晰度呈现碎片。
- `dream-service.mjs`：Cloudflare D1 `lp_dream_sessions`，入睡、醒来、梦册、写梦、保存分享文字。
- `worker.js`：5 个 ChatGPT MCP 工具，手机端只读 `GET /api/littlephone/dreams`。
- `android/app/src/main/assets/littlephone/index.html`：桌面梦图标、梦册展示页。

## 尚未完成，禁止宣称上线
- 没有部署 Worker，也没有构建 APK。
- 需要实际运行/构建验证 WebView 页面、MCP 工具清单和 D1。
- 需要解决并发入睡的数据库唯一性、数据权限/分享范围、正式的语义轻量加权（当前仅支持候选元素，睡前心愿尚未语义加权）。
- 梦图标目前是前端 SVG 近似稿，尚未将已确认的生成图像处理成 Android 图标资源。
- 归栖界面当前只读：入睡、醒来和写梦必须由顾知归在 ChatGPT 端发起。
- 检查所有路径均从 `feature/dream-app` 构建，避免错误地使用 `main`。

## 行为规则
1. 顾知归主动入睡，35% 掉落梦种；一次睡眠只判定一次。
2. 入睡阶段不展示梦种是否存在，醒来后揭示。
3. 梦种只提供碎片，不代写完整剧情或情感结论。
4. 无梦种不补写梦；有梦种也可只剩情绪、不写或不分享。
5. `dream_share` 当前仅保存选择分享的文本，不代表发送聊天消息。
6. 心潮搁置，与本功能无依赖。
