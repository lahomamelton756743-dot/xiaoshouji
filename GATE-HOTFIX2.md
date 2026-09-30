# 门禁执行热修 2

- 不升版本，不改门禁 UI。
- 修复“门禁状态显示已锁，但目标 App 仍可继续使用”。
- 远程创建门禁时强制恢复门禁总开关，避免旧本地开关状态让规则只保存不执行。
- 命中被锁 App 后，无障碍先执行 HOME 离开目标 App，再启动原有 LockActivity；若 Android 拦截第一次后台 Activity 启动，只重试一次，不增加第二套遮罩/UI。
- 保留上一轮 command polling / accessibility reconnect 修复。
