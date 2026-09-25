# 小米健康桥（v0.5.2 预留）

v0.5.2 只固定桥接契约，不在此版本保存任何小米账号、二维码登录 token 或亲友凭据。

后续真实接入计划：

1. 独立 Python 服务使用 `mi-fitness-python` 登录小米小号。
2. 小号通过“小米运动健康”的亲友共享读取瑞安授权的数据。
3. 健康桥把摘要规范化后，使用小手机后端的 Bearer Token POST 到：
   `POST /api/littlephone/health-summary`
4. 小手机前端与 MCP 都只读取规范化后的摘要，不直接依赖第三方库的字段细节。

建议 payload：

```json
{
  "connected": true,
  "source": "mi-fitness-python",
  "sleep": {
    "total_minutes": 438,
    "score": 86,
    "sleep_at": "2026-09-24T23:48:00+08:00",
    "wake_at": "2026-09-25T07:31:00+08:00"
  },
  "steps": { "count": 6421 },
  "heart_rate": { "resting": 67 },
  "cycle": null,
  "updated_at": "2026-09-25T08:00:00+08:00"
}
```

未接入时后端返回：

```json
{
  "connected": false,
  "source": "not_connected",
  "sleep": null,
  "steps": null,
  "heart_rate": null,
  "cycle": null,
  "error": "health_source_not_connected"
}
```

安全原则：

- token 只留在健康桥服务器，不放进 Android 前端、GitHub 源码或 MCP 描述。
- 默认只把健康摘要同步到小手机后端，不长期上传完整心率时间序列等原始数据。
- 小米 token 失效时显式显示“健康数据源未连接/需要重新授权”，不得复用旧数据冒充当前数据。
