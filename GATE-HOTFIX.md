# 门禁连接热修复（不升版本）

- 修复旧会话残留 `user_stopped=true` 后，APK 即使前台打开且无障碍已开启也不再轮询 command queue 的问题。
- 小手机重新打开时会自动恢复 CompanionService 命令轮询。
- 无障碍服务重新连接时，如果本机已有 server/token，会立即恢复 CompanionService，而不是只等待 watchdog。
- 保留手动停止：当前会话按“停止服务”仍会停止；重新打开小手机视为显式重新连接。
- 不修改门禁页面和门禁视觉效果，不升应用版本号。
