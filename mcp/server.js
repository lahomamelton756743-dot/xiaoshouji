#!/usr/bin/env node
/**
 * little-phone v0.7.5
 *
 * The former local/Render MCP gateway is intentionally retired.
 * The supported MCP endpoint is served directly by the canonical
 * Cloudflare Worker at: <LITTLE_PHONE_WORKER_URL>/mcp
 *
 * This file remains only so old deployment scripts fail explicitly
 * instead of silently falling back to a legacy backend.
 */
const worker = String(process.env.LITTLE_PHONE_WORKER_URL || '').trim().replace(/\/$/, '');
const endpoint = worker ? `${worker}/mcp` : '<your-worker.workers.dev>/mcp';
console.error(`[little-phone v0.7.5] DEPRECATED local MCP entry. Configure ChatGPT to use ${endpoint}. No Render fallback exists.`);
process.exitCode = 2;
