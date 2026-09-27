# 小手机 v0.7.1

**Rebuilt from stable v0.6.3.** 这次升级只以最后稳定的 `little-phone v0.6.3` 为代码基线，不使用失败旧 0.7.x 的 bootstrap、API client 或数据读取改造。

## 数据与后端原则

- 正式后端只有 `server/little-phone-cloudflare/`。
- 继续使用原有 D1、Worker secrets、API base URL、token/header、bootstrap/cache 和历史数据；**不要清库，不要新建空数据库替代旧库**。
- `papers / mail / capsules / calls / todos / statuses / diaries / dailybook / dates / profiles / memories` 沿用 v0.6.3 数据结构和读取链路。
- `lock_app / unlock_app / trigger_call` 保留已稳定实现。
- `open_little_phone_app` 与兼容别名 `open_app` 只创建 Cloudflare → Android `open_app` command；不会回退历史后端。
- Android command dispatcher 支持 `open_app / home / back / recents / screen_off / get_phone_state / get_life_state / get_senses_state`，并回报 command 结果。
- 旧本地 MCP/Render 网关已明确 deprecated；`mcp/server.js` 只负责报错提示，不代理、不 fallback。

## v0.7.1 UI

一级导航固定为：`日记 ｜ 留痕 ｜ 首页 ｜ 信箱 ｜ 状态`，首次打开默认首页，选中态直接绑定 active page，不存在独立滑动气泡。

首页依次为相伴主视觉、时间/天气、双头像与一起听、完整月历、待办。日记成为独立一级页；普通信和未来信分区；未解锁未来信只返回寄件人/创建日/解锁日/locked；留痕页保留纸条、`{daddy.display_name} 记得`、来电记录和日常册时间河；状态页前三块固定为健康、足迹、手机状态；设置项进入逐级设置页面。

身份数据始终使用稳定 actor `user` / `daddy`，显示名、头像、身份色和身份字体只是显示层。身份色只应用到本人写下的内容，不污染系统 UI。当前“奶酪感”选项明确使用系统圆体近似，没有伪装为独立字体资源。

## 版本

- `versionName = 0.7.1`
- `versionCode = 70310`
- APK 目标名：`LittlePhone-v0.7.1.apk`
- ZIP：`little-phone-v0.7.1.zip`
- Branch：`main`
- Commit：`Rebuild little-phone v0.7.1 from stable v0.6.3`

## 部署

1. 先备份现有 Worker/D1 配置；不要删除原 D1。
2. 部署 `server/little-phone-cloudflare/` 到原有 Worker 环境，继续绑定原 D1/媒体桶/secrets。
3. 运行后端回归测试，确认 `/health` 返回 `0.7.1-little-phone`。
4. 构建并安装 Android APK。由于 `versionCode=70310`，可覆盖已安装过较低 versionCode 的历史包。
5. 真机打开后先确认纸条、普通信、未来信、来电、待办、状态、日记、日常册、纪念日仍能读取，再检查新版 UI。

## 本地验证

```bash
node --check server/little-phone-cloudflare/worker.js
node --check server/little-phone-cloudflare/test.mjs
node server/little-phone-cloudflare/test.mjs
node --check mcp/server.js
python -m py_compile server/health-bridge/app.py
```

前端内联 JS 也必须提取后执行 `node --check`。Android 网络排查统一看 Logcat tag `LittlePhoneHTTP`，会记录 endpoint、真实 URL、HTTP code、response 前缀与 JSON parse error，但不会记录 token。

Android 构建：

```bash
cd android
./build.sh
```

## 数据安全

本版本没有“清空 D1”步骤，也没有用新空表替换 v0.6.3 真实数据。Worker 的 schema 初始化继续采用幂等建表/补字段方式；正常删除接口只删除用户明确指定的单条记录。
