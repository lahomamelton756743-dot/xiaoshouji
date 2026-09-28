#!/usr/bin/env bash
set -euo pipefail
cat >&2 <<'MSG'
DEPRECATED: little-phone v0.7.5 no longer starts a local MCP/Render gateway.
Deploy server/little-phone-cloudflare and use its public HTTPS /mcp endpoint.
MSG
exit 2
