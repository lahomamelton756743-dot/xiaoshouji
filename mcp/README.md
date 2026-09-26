# Legacy local MCP

此目录保留旧掌心窗时期的本地 MCP 代码，仅用于历史兼容/参考。

小手机 v0.6.2 的正式 MCP 入口是 Cloudflare Worker：

`<little-phone-backend>/mcp`

正式 ChatGPT 插件必须使用公网 HTTPS MCP，不能依赖 localhost、桌面客户端或本地文件系统。本目录不会作为 v0.6.2 移动端插件入口。
