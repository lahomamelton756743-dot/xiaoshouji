# 小手机 v0.7.3

**Stable lineage: v0.6.3 → rebuilt v0.7.1 → v0.7.2 → v0.7.3.** 本版继续沿用已经跑通的 Cloudflare + D1 数据链和 v0.7.2 小米健康 Bridge，不清库、不另起新后端，重点修真机交互与 0.7.3 视觉。

## v0.7.3 本轮重点

- **Together / 一起听重排**：删除头像之间的连接线；两个头像集中在左侧，每次进入首页轻轻靠近一次；右侧显示歌曲、歌手和 QQ 音乐来源；底部使用一整行长心形音柱，心形主体小幅呼吸、两侧音柱幅度更明显，播放时有从左向右的流光。
- **首页更“花”**：顶部增加花体叠字、曲线与微光点，装饰层位于内容上层，可轻微覆盖天气时间卡但不拦截点击。
- **仿真日记本**：取消底部翻页按钮；轻触书页左边往前、右边往后；加入 3D 翻页残影、纸张纹理、横线、页边、页码和真实日记排版。
- **未来信仿真**：未拆/到期未拆显示封口信封与蜡封；已拆显示信纸从信封抽出的状态；普通信保持独立设计。
- **设置页 bug 修复**：保留原设置页全部入口，补回缺失的 `openSettingsSection()` 与动态详情页事件绑定；来电提醒、设备权限、门禁、连接、外观入口均可进入并继续调用真实 Android Native 能力。
- **玻璃层加强**：卡片降低实体白底感，提高背景透出、模糊、边缘高光和淡蓝/淡紫折射。
- **小米健康真正进 APP**：进入状态页自动向 Cloudflare 请求 `/api/littlephone/health/refresh`；健康弹窗可手动刷新；睡眠/评分/步数/最近心率直接使用 Bridge 的真实数据；缺少深睡/浅睡/REM 细分时显示“暂无细分”，不把缺失值伪装成 0。
- **健康冷启动兼容**：Android 仅对 `/api/littlephone/health/*` 延长网络读取超时到 75 秒，避免 Render 免费实例冷启动时 10 秒就误判失败；其他小手机请求仍保持短超时。

> 音乐状态目前能读取“播放/暂停、歌曲、歌手、App”，Android 媒体接口没有提供真实音频振幅，因此心形音柱会在“正在播放”时动态并有流光，但不会虚构成真实逐拍音频频谱。

## 数据与后端原则

- 正式后端仍是 `server/little-phone-cloudflare/`，继续绑定现有 Worker 和原 D1 `little-phone-v051`。
- `papers / mail / capsules / calls / todos / statuses / diaries / dailybook / dates / profiles / memories` 全部沿用原数据表和读取链路；禁止为了 0.7.3 清库。
- 小米健康继续使用既有 `lp_health_summary` + `lp_health_daily`；不删除、不改名。
- `server/health-bridge/` 使用已经实测能读取亲友共享数据的最终兼容版；不要为了 UI 版本升级重新改写登录/亲友解析逻辑。
- `lock_app / unlock_app / trigger_call / open_app` 与 Android command dispatcher 沿用稳定实现。
- 旧 Render 手机网关/旧本地 MCP 不作为静默 fallback。

## 小米运动健康数据流

```text
小米运动健康云端
  → mi-fitness-python（小号 token + 亲友/家庭共享）
  → Render Xiaomi Health Bridge
  → Cloudflare Worker
  → D1 最新摘要 + 按日期历史
  → 小手机状态页 / ChatGPT MCP
```

Cloudflare Worker 需要保留：

```text
XIAOMI_HEALTH_BRIDGE_URL    = https://xiaoshouji-m0ue.onrender.com
XIAOMI_HEALTH_BRIDGE_TOKEN  = Secret（与 Render HEALTH_BRIDGE_TOKEN 相同）
```

MCP 健康工具：

- `get_health_summary(date?, refresh?)`
- `get_sleep(date?, refresh?)`
- `get_heart_rate(date?, refresh?)`
- `get_steps(date?, refresh?)`
- `get_sleep_summary(date?, refresh?)`（兼容入口）
- `refresh_health_data(date)`

如果 ChatGPT 仍只看到旧的两个健康工具，优先刷新/重连 MCP 工具表；不要因此重写已经跑通的 Render Bridge。

## 设置页

0.7.3 保留并修复以下入口：

- 来电与提醒
- 设备权限
- 应用门禁
- 连接设置
- 外观与背景

设置详情页由动态 DOM 创建，因此按钮事件必须在每次 `renderSettingsDetail()` 后重新绑定。0.7.3 已补齐测试通知、测试弹窗、权限预览、天气刷新、门禁权限/刷新/添加锁定和连接配置事件。

## 安全部署工作流

本包包含：

```text
.github/workflows/deploy-little-phone-backend-v073.yml
```

它只查找已有 D1，**绝不自动创建新 D1**，并使用 `keep_vars = true` 保留 Cloudflare Dashboard 中现有 Variables/Secrets。

运行时填写：

```text
Branch            main
worker_name       little-phone-backend
d1_database_name  little-phone-v051
```

## 版本

- `versionName = 0.7.3`
- `versionCode = 70330`
- Worker：`0.7.3-little-phone`
- Health Bridge：`0.7.3-final-compat`
- APK 目标名：`LittlePhone-v0.7.3.apk`
- ZIP：`little-phone-v0.7.3.zip`
- Branch：`main`
- 建议 Commit：`Build little-phone v0.7.3 glass UI, settings fix and live Xiaomi health`

## 推荐部署顺序

1. 将本 ZIP 解压内容覆盖到 GitHub `main`（不要删除线上 D1，不要上传本地 `.git`）。
2. Render Health Bridge 如已是最终兼容版且能返回真实数据，可保持不动；仓库覆盖后若 Render 自动部署，只需确认重新回到 `Live`。
3. GitHub Actions 运行 `部署小手机后端 v0.7.3（保留现有 D1）`，参数使用上面的现有 Worker/D1 名称。
4. 打开 `https://little-phone-backend.lahomamelton756743.workers.dev/health`，确认版本为 `0.7.3-little-phone`。
5. 再运行现有 `Build Android Debug APK` 工作流，构建并安装 0.7.3 APK。
6. 真机重点验收：设置页五个入口、小米健康自动刷新、日记左右翻页、未来信拆/未拆状态、Together 头像动画与音乐波形。

## 本地验证

```bash
node --check server/little-phone-cloudflare/worker.js
node server/little-phone-cloudflare/test.mjs
node --check mcp/server.js
python -m py_compile server/health-bridge/app.py
bash -n android/build.sh
```

前端内联 JS 需提取后再执行 `node --check`。Android 网络问题查看 Logcat tag `LittlePhoneHTTP`；日志记录 endpoint、真实 URL、HTTP code 和 response 前缀，但不得记录 token。
