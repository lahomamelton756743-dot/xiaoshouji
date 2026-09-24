# 留痕 v0.1

第一阶段目标：先打通「瑞安发布留痕 → ChatGPT/MCP 读取 → ChatGPT 贴纸条」的数据闭环，不依赖无障碍。

## Server API

- `GET /api/traces?limit=30`：读取最近留痕。
- `POST /api/traces`：发布留痕。JSON: `{author, content, images}`。
  - `images` 最多 9 张。
  - App 可传 `{data: "data:image/jpeg;base64,..."}`；服务端会保存到 `data/trace_media/`。
  - MCP 可传 `{url: "https://..."}`。
- `POST /api/traces/{trace_id}/notes`：贴纸条。JSON: `{author, content}`。
- `POST /api/traces/notes/seen`：标记纸条已读。
- `GET /media/traces/{filename}`：读取留痕图片。

## MCP tools

- `list_traces(limit)`
- `create_trace(content, image_urls, author)`
- `add_trace_note(trace_id, content, author)`
- `mark_trace_notes_seen(trace_id)`

## 下一阶段（v0.2）

Android 独立「留痕」页：液态玻璃底栏、文字/多图发布、详情页、纸条回复；再加入消息页。
