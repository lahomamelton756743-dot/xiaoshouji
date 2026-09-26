# 小手机 v0.7.1

瑞安与 ChatGPT 私人使用的小手机。v0.7.1 继续以现有 v0.6.3 功能链路为基础升级，不清空真实数据，不重写已经真机验证通过的来电和应用门禁核心实现。

## v0.7.1 重点

- 一级导航正式改为：**日记 / 留痕 / 首页 / 信箱 / 状态**。首页仍在正中间，并像原来的「＋」一样更大、更突出。
- 「日记」从原页面抽出成为最左侧一级页面，进入时直接展示封面，页面名称只叫「日记」。
- 首页顶部改成渐变花体关系标题，`13` 等相伴天数作为大数字视觉中心；天数从重要日期中的关系起始日动态计算。
- 时间天气卡保留团雀 + 深靛蓝月亮徽记，徽记放大填满圆形区域；删除「无快照」，改成根据真实天气生成的 daddy 留言。
- 双头像和一起听组件移到首页时间卡下面：头像靠左相碰；耳机线从头像耳朵附近引出、在中间缠绕并自然垂落到接近组件底部；右侧是窄长音乐胶囊，歌名/歌手左对齐，右侧为持续轻微波动的爱心音波。
- 首页直接完整展示一个月的仿真实体月历；点击日期即可进入标记/备注；圆圈、星星、心形、下划线、虚线圈、小旗等标记跟随标记者身份色；删除旧的「实体日历……」说明。
- 首页月历下面为待办；手机状态和双方足迹全部移出首页。
- 原「我们」页正式改名为「状态」：最上方小米健康占整行，其次双方足迹，再下面手机状态与今日 App 使用前五名。
- 状态页右上角新增系统式「设置」入口；来电与提醒、设备权限、应用门禁、连接设置、外观与背景不再平铺为组件。设置页按手机设置风格分层进入/返回。
- 「外观与背景」支持全局背景，也支持日记 / 留痕 / 首页 / 信箱 / 状态五页分别设置背景；主卡整体进一步提高透明度和液态玻璃感。
- 双方身份字体继续独立保存；奶酪体改成更软糯的圆润/手写方向，同时增加「轻斜体 / 花体感」预设。双方互不联动。
- 普通信与未来信继续分开；普通信和未来信轮播都改成首尾循环，不再存在第一封/最后一封切不到的问题。
- 已拆 / 未拆信封的视觉差异加强：未拆为完整封口 + 蜡封感，已拆显示信纸边缘；寄件人与日期使用更接近正式信件的 FROM / DATE 版式。
- 留痕页保持「纸条 | {display_name} 记得」，来电记录为全宽一行一条。
- `{display_name} 记得` 后端 D1/API 已存在，本版补齐 MCP `remember_about_user / list_daddy_memories / update_daddy_memory / confirm_daddy_memory / correct_daddy_memory`，确保 ChatGPT 能真正读、写、确认、纠错。
- Cloudflare `open_little_phone_app(package/app/device_id)` 保持为正式打开 App 入口；旧 `open_app` 只做 Cloudflare → Android command 兼容映射，不回退旧 Render。
- Xiaomi Health Bridge 骨架继续保留，等待小米亲友授权/token 后接真实睡眠、心率、步数。

## 部署顺序

1. 覆盖仓库到 v0.7.1。
2. 先部署 `server/little-phone-cloudflare/`，继续使用现有 D1 与 Worker secret，不清库。
3. 再构建并安装 Android APK。页面结构、设置入口、身份字体、背景与通用 command dispatcher 都需要新 APK。
4. 部署后检查 `/health` 应返回 `0.7.1-little-phone`。

## Android 构建

```bash
cd android
./build.sh
```

预期输出：`android/LittlePhone-v0.7.1.apk`。

## 回归检查

```bash
node server/little-phone-cloudflare/test.mjs
node --check server/little-phone-cloudflare/worker.js
node --check mcp/server.js
python -m py_compile server/health-bridge/app.py
```

真机优先回归：

- 新导航顺序与中间放大的首页入口
- 日记进入时默认展示封面
- 首页耳机线、音乐胶囊、完整月历和天气留言
- 状态页设置入口与背景切换
- `remember_about_user / list_daddy_memories / confirm_daddy_memory / correct_daddy_memory`
- `open_little_phone_app` 是否从 pending 被 Android 消费并回报 completed
- 普通信 / 未来信分区、首尾循环与锁定正文不泄漏
- user / daddy 独立身份字体与身份色

## 交付

- ZIP：`little-phone-v0.7.1.zip`
- Branch：`main`
- Commit：`Upgrade little-phone to v0.7.1`
