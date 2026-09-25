# 小手机 v0.4｜融合版

这一版把两个方向合在一起：

- 前台 UI 改成 Web/PWA 风格的单页壳子，适合液态玻璃、动态底栏和快速改版；
- Android 原生层继续保留掌心窗已有的设备状态、天气、日历、屏幕使用时间、权限与控制能力；
- server + MCP 继续作为 ChatGPT 读写的中枢，不引入任何模型 API；
- 原来的“消息”改成“信箱”，明确定位为异步投递，不假装实时聊天；
- 新增时间胶囊；留痕继续保留文字、多图和纸条；
- 截图入口与远程截图动作关闭。

## 首页五栏

首页｜留痕｜＋｜信箱｜我们

中间 + 支持：留痕、投信、小纸条、时间胶囊。

## 连接

小手机是独立包名，无法直接读取原掌心窗 SharedPreferences。连接设置仍只保存在本机；v0.4 不再反复弹窗催连接，未连接时首页的本机时间、天气、日历、电量、屏幕使用时间仍可使用，云端留痕/信箱/胶囊会显示“未连接”。

## server 新接口

- GET/POST `/api/mail`
- POST `/api/mail/seen`
- GET/POST `/api/capsules`
- 原 `/api/traces` 与 `/api/companion/whisper` 继续使用

## MCP 新工具

- `list_mailbox`
- `send_mail`
- `mark_mail_seen`
- `list_time_capsules`
- `create_time_capsule`

旧 `list_messages / leave_message / mark_messages_seen` 保留兼容，但从 v0.4 起映射到信箱。

## 视觉

主界面由 `android/app/src/main/assets/littlephone/index.html` 驱动。液态玻璃使用 WebView 的 CSS blur / saturation / 半透明高光 / 动态 aurora 背景；原生 Android 页面退到“设备、日历与权限”设置入口。
