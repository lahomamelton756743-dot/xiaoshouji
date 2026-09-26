# 小手机 v0.6.3

瑞安与 ChatGPT 私人使用的小手机。v0.6.3 继续以 v0.5.2 为功能基线、v0.4.1 为视觉母版升级，不清空现有数据，不重写已经真机验证通过的来电与应用门禁核心链路。

## v0.6.3 重点

- 「我们」页顶部重新排版：窄长一起听音乐条、两侧状态、靠在一起的双头像、柔软耳机线只汇合一次、动态“相伴 N 天”。
- 纪念日卡改成实体月历式入口：首页显示当天日期，展开后可直接点日期，选择圆圈/星星/心形/下划线/虚线圈/小旗等手绘标记；标记者使用稳定 `user` / `daddy`，颜色动态跟随身份色。
- 双人身份字体完全独立：每个人分别保存 `identity_font`；新增“奶酪体（圆润）”风格预设，身份色与字体用于本人写下的纸条、信、状态、日常册等内容，系统 UI 不被污染。
- 普通信与未来信重新分区：普通信上方单独轮播和日期归档；未来信固定回到下方自己的轮播/归档，解锁后仍保持“未来信”身份。
- 留痕保持“纸条 | {display_name} 记得”，来电记录下移为全宽一行一条。
- 日记封面和内容页统一尺寸；长正文可完整滚到导航栏上方。
- 权限页新增无障碍、悬浮窗、使用情况访问、通知/通知访问等 Android 系统能力状态和入口。
- 主动提醒新增 `{display_name} 的文案`：喝水/休息文案可独立自定义，支持 `{user}` / `{daddy}` 占位符，规则与文案分开保存。
- 应用门禁只保留统一 LockActivity；不再叠第二层旧门禁 UI；长按 5 秒紧急解锁不需要口令。修复门禁页过早退出兜底逻辑，不改 `lock_app` 核心实现。
- 新增 Cloudflare MCP `open_little_phone_app(package/app/device_id)`；旧 `open_app` 仅作为兼容别名，也直接创建 Little Phone Android `open_app` command，不再转发旧 Render。
- Android 通用 command dispatcher 明确消费 `open_app` / Home / Back / Recents / screen_off / 状态读取等命令；优先从无障碍服务上下文启动 App。
- 旧本机多日记本命令、门禁别名等继续经当前 Cloudflare → Android command queue，不回退旧 Render。
- Xiaomi Health Bridge 骨架保留，等待小米亲友授权/token 后接真实睡眠、心率、步数。

## 数据迁移

Cloudflare Worker 启动时继续使用幂等迁移补字段，不要求清空 D1。v0.6.3 额外为重要日期补充：

- `mark_style`
- `marked_by`

`marked_by` 使用稳定身份键（`user` / `daddy`），不会把当前显示名或颜色写死到历史数据里。

## 部署顺序

1. 覆盖仓库到 v0.6.3。
2. 先部署 `server/little-phone-cloudflare/`，继续使用现有 D1 与 Worker secret，不清库。
3. 再构建并安装 Android APK；`open_app` dispatcher、统一门禁页、权限展示和自定义提醒文案都需要新 APK。
4. 部署后检查 `/health` 应返回 `0.6.3-little-phone`。

## Android 构建

```bash
cd android
./build.sh
```

预期输出：`android/LittlePhone-v0.6.3.apk`。

## 回归检查

```bash
node server/little-phone-cloudflare/test.mjs
node --check server/little-phone-cloudflare/worker.js
node --check mcp/server.js
python -m py_compile server/health-bridge/app.py
```

同时应检查 `index.html` 内联 JavaScript 语法，并在真机上重点回归：

- `lock_app` / `unlock_app` 与全屏门禁页
- `open_little_phone_app` 是否从 pending 被 Android 消费并回报 completed
- 普通信/未来信分区和锁定正文不泄漏
- user/daddy 独立字体与颜色
- 日记到底部不被导航栏遮挡
- 无障碍权限状态是否正确显示

## 交付

- ZIP：`little-phone-v0.6.3.zip`
- Branch：`main`
- Commit：`Upgrade little-phone to v0.6.3`
