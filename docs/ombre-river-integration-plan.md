# OB × 小手机：安全接入与时间河重整（开发分支）

## 已从代码确认的事实

- Android 端真实页面在 `android/app/src/main/assets/littlephone/index.html`，后端在 `server/little-phone-cloudflare/worker.js`。
- 日记使用 `lp_diaries`，含稳定 ID、日期、作者、标题、正文、创建/更新时间；`lp_diary_annotations` 保存批注。
- 日常册使用 `lp_dailybook`，含稳定 ID、日期、作者、心情、正文及图片。首页的 `renderRiver()` 是日常册横向预览。
- 独立时间河是 `page-app-river`，使用纵向 `riverClassic*` 样式。页面中存在历史 CSS 覆盖；不能直接假定横向与纵向组件彼此冲突。
- `lp_events` 的短期事件会过期清理，不能充当永久时间河的唯一真源。
- Cloudflare Worker 已提供 API 和 MCP；不应将 OB 的 Python/Docker 进程直接塞入 Worker。

## 不可破坏的约束

1. `main` 生产分支不直接修改；不改变原日记/日常册表结构，不覆盖原数据。
2. 日记、批注、日常册、纸条、信件、健康、心潮及现有 MCP 工具保持可用。
3. OB 是可选的独立服务；断线时原功能继续可用。初期不向 OB 自动传送信件、纸条、聊天、健康数据。
4. 只从用户明确授权的日记或长期记忆同步到 OB；同步前必须有明确的范围开关。
5. 先单向小手机→OB；严禁未经确认用 OB 分解后的 buckets 回写替换日记正文。
6. 时间河真实记录始终显示原来源、原日期和原 ID；OB 提取的记忆应标注来源并与原记录关联，不伪装成独立日记。
7. 不在 GitHub、日志或 UI 代码中提交 token、日记正文、用户私密数据。

## OB 同步适配层设计

- 新增独立映射表（计划）`lp_ombre_links`：`source_type`, `source_id`, `source_updated_at`, `content_hash`, `ob_bucket_ids_json`, `sync_status`, `last_attempt_at`, `last_success_at`, `error_code`。
- 唯一键：`(source_type,source_id)`。原记录 ID 不变；OB bucket ID 可以一对多。
- 同步任务按内容哈希去重；失败可重试，不阻塞日记写入；更新先标记待同步，不能自动删除旧 OB bucket。
- 仅后端持有 OB 凭据，使用 Cloudflare secret；所有访问经 HTTPS + OB 认证。不得从 Android WebView 直接携带 OB 密钥。
- OB 官方 Docker 模板的持久目录为 `/app/buckets`，需要独立持久卷；备份必须包含 Markdown buckets 与 source evidence（若启用）。
- 日记是原文真源；OB `grow` 是记忆分解工具，不能替代日记 CRUD。
- 先使用云端 embedding；本地 Ollama profile 额外需要约 2–3GB 内存，不纳入 2GB VPS 基准。

## 时间河重整范围

- 首页：保留横向日常册预览，仍以 `lp_dailybook` 为数据源。
- 独立时间河：统一纵向布局与样式，消除同一组件的互相覆盖规则；不再追加层叠 `!important` 补丁。
- 数据：以持久日常册为主体；经用户授权后可加入带来源的日记/OB 记忆；短期 `lp_events` 只可作为可选临时留痕。
- 交互：按原日期稳定排序；打开记录仍使用原有详情操作；空数据、离线、超长标题、窄屏都要处理。

## 发布前验收

- 日记：封面→最早一页→逐页翻阅→回封面；搜索、批注、关闭正常。
- 时间河：首页预览和独立页面不串数据；多条/单条/空数据均正常；Android 窄屏无横向页面溢出。
- 同步：重复调用不产生重复关联；OB 离线时原日记保存成功；恢复后可重试；不发生敏感数据越权同步。
- 数据：D1 旧记录数量、ID、正文、批注不变；关闭 OB 后页面仍能正常工作。
- 部署：在测试环境验证实际峰值内存、磁盘增长、模型调用费用、备份与恢复，再确定云端套餐。

**状态：审计与隔离分支已建立；以上是实现规范，不代表同步代码、UI 重构或服务器压测已经完成。**
