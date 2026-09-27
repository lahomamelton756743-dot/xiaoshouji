# MCP（v0.7.2）

小手机 v0.7.2 的正式 MCP 入口已经统一到 Cloudflare Worker：

`https://<你的 Worker 域名>/mcp`

`server/little-phone-cloudflare/worker.js` 同时提供 API、MCP `tools/list` / `tools/call` 和 Android command queue。

本目录只保留一个明确的 deprecated 启动入口，用来防止旧部署脚本静默回退历史后端。它不会代理请求，也不会推断或请求旧 Render 地址。
