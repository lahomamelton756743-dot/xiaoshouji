const VERSION = "0.6.2-little-phone";
const DEFAULT_DEVICE = "android-phone";
const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28";
const MCP_LEGACY_PROTOCOL_VERSION = "2025-11-25";
const MCP_COMPAT_PROTOCOL_VERSIONS = [MCP_MODERN_PROTOCOL_VERSION, MCP_LEGACY_PROTOCOL_VERSION, "2025-06-18"];
const SNAPSHOT_TTL_SECONDS = 30 * 60;
const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

let schemaReady = null;

export default {
  async fetch(request, env) {
    try {
      await ensureSchema(env);
      return await handle(request, env);
    } catch (err) {
      return json({ ok: false, error: "worker_exception", detail: String(err?.stack || err) }, 500);
    }
  }
};

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  if (path === "/" || path === "/health") {
    return json({
      ok: true,
      service: "little-phone-backend",
      version: VERSION,
      storage: "Cloudflare D1",
      mcp: "/mcp",
      snapshot_ttl_minutes: 30,
      trace_ttl_days: 7,
      screenshot: false
    });
  }

  // OAuth 2.1 / MCP authorization discovery and endpoints.
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") return oauthProtectedResourceMetadata(url);
  if (path === "/.well-known/oauth-authorization-server") return oauthAuthorizationServerMetadata(url);
  if (path === "/register") return oauthRegister(request, env, url);
  if (path === "/authorize") return oauthAuthorize(request, env, url);
  if (path === "/token") return oauthToken(request, env, url);

  if (path === "/mcp") return handleMcp(request, env, url);

  // 日常册照片如果使用 R2，返回的是随机不可猜 key。此读取路由不附带 Token，
  // 因为 WebView <img> 不会自动携带 Authorization。若未绑定 R2，此路由返回 404。
  if (request.method === "GET" && path.startsWith("/media/littlephone/")) {
    return getMedia(env, path.slice("/media/littlephone/".length));
  }

  if (!tokenOk(request, env, url)) return json({ ok: false, error: "LINJIAN_ERR_BAD_TOKEN" }, 403);

  if (request.method === "GET") {
    if (path === "/api/poll") return pollCommand(env, url);
    if (path === "/api/command/status") return commandStatus(env, url);
    if (path === "/api/littlephone/bootstrap") return bootstrapApi(env);
    if (path === "/api/littlephone/visit/latest") return getLatestVisitApi(env, url);
    if (path === "/api/littlephone/events") return listEventsApi(env, url);
    if (path === "/api/littlephone/papers") return listPapersApi(env, url);
    if (path === "/api/littlephone/dailybook") return listDailybookApi(env, url);
    if (path === "/api/littlephone/diaries") return listDiariesApi(env, url);
    if (path === "/api/littlephone/todos") return listTodosApi(env, url);
    if (path === "/api/littlephone/dates") return listDatesApi(env, url);
    if (path === "/api/littlephone/cycle") return getCycleApi(env);
    if (path === "/api/littlephone/statuses") return getStatusesApi(env);
    if (path === "/api/littlephone/calls") return listCallsApi(env, url);
    if (path === "/api/littlephone/health-summary") return getHealthSummaryApi(env);
    if (path === "/api/littlephone/profiles") return getProfilesApi(env);
    if (path === "/api/littlephone/memories") return listMemoriesApi(env, url);
    if (path === "/api/littlephone/unlock-requests") return listUnlockRequestsApi(env, url);
    if (path === "/api/mail") return listMailApi(env, url);
    if (path === "/api/capsules") return listCapsulesApi(env, url);
  }

  if (request.method === "POST") {
    if (path === "/api/littlephone/visit") return queueVisitApi(env, await readJson(request));
    if (path === "/api/device/report") return deviceReportApi(env, await readJson(request));
    if (path === "/api/device/state") return json({ ok: true, ignored: true, reason: "little_phone_does_not_persist_periodic_device_state" });
    if (path === "/api/littlephone/events") return addManualEventApi(env, await readJson(request));
    if (path === "/api/littlephone/papers") return addPaperApi(env, await readJson(request));
    if (path === "/api/littlephone/dailybook") return addDailybookApi(env, await readJson(request));
    if (path === "/api/littlephone/dailybook/update") return updateDailybookApi(env, await readJson(request));
    if (path === "/api/littlephone/diaries") return addDiaryApi(env, await readJson(request));
    if (path === "/api/littlephone/diaries/update") return updateDiaryApi(env, await readJson(request));
    if (path === "/api/littlephone/diaries/delete") return deleteRowApi(env, "lp_diaries", await readJson(request));
    if (path === "/api/littlephone/todos") return addTodoApi(env, await readJson(request));
    if (path === "/api/littlephone/todos/toggle") return toggleTodoApi(env, await readJson(request));
    if (path === "/api/littlephone/todos/update") return updateTodoApi(env, await readJson(request));
    if (path === "/api/littlephone/events/delete") return deleteRowApi(env, "lp_events", await readJson(request));
    if (path === "/api/littlephone/papers/delete") return deleteRowApi(env, "lp_papers", await readJson(request));
    if (path === "/api/mail/delete") return deleteRowApi(env, "lp_mail", await readJson(request));
    if (path === "/api/capsules/delete") return deleteRowApi(env, "lp_capsules", await readJson(request));
    if (path === "/api/littlephone/dailybook/delete") return deleteDailybookApi(env, await readJson(request));
    if (path === "/api/littlephone/todos/delete") return deleteRowApi(env, "lp_todos", await readJson(request));
    if (path === "/api/littlephone/dates") return addDateApi(env, await readJson(request));
    if (path === "/api/littlephone/dates/update") return updateDateApi(env, await readJson(request));
    if (path === "/api/littlephone/dates/delete") return deleteRowApi(env, "lp_dates", await readJson(request));
    if (path === "/api/littlephone/cycle/settings") return setCycleSettingsApi(env, await readJson(request));
    if (path === "/api/littlephone/cycle/records") return addCycleRecordApi(env, await readJson(request));
    if (path === "/api/littlephone/cycle/records/update") return updateCycleRecordApi(env, await readJson(request));
    if (path === "/api/littlephone/cycle/records/delete") return deleteRowApi(env, "lp_cycle_records", await readJson(request));
    if (path === "/api/littlephone/statuses") return setStatusApi(env, await readJson(request));
    if (path === "/api/littlephone/calls") return upsertCallApi(env, await readJson(request));
    if (path === "/api/littlephone/calls/delete") return deleteRowApi(env, "lp_calls", await readJson(request));
    if (path === "/api/littlephone/health-summary") return setHealthSummaryApi(env, await readJson(request));
    if (path === "/api/littlephone/profiles") return setProfileApi(env, await readJson(request));
    if (path === "/api/littlephone/memories") return addMemoryApi(env, await readJson(request));
    if (path === "/api/littlephone/memories/update") return updateMemoryApi(env, await readJson(request));
    if (path === "/api/littlephone/memories/delete") return deleteRowApi(env, "lp_memories", await readJson(request));
    if (path === "/api/littlephone/unlock-requests/respond") return respondUnlockRequestApi(env, await readJson(request));
    if (path === "/api/littlephone/command") return queueGenericCommandApi(env, await readJson(request));
    if (path === "/api/appgate/unlock_request") return addUnlockRequestApi(env, await readJson(request));
    if (path === "/api/mail") return addMailApi(env, await readJson(request));
    if (path === "/api/mail/seen" || path === "/api/mail/read") return markMailSeenApi(env, await readJson(request));
    if (path === "/api/capsules/seen" || path === "/api/capsules/read") return markCapsuleSeenApi(env, await readJson(request));
    if (path === "/api/capsules") return addCapsuleApi(env, await readJson(request));
  }

  // 截图能力在这个后端不存在。
  if (["/api/peek", "/api/screenshot", "/api/latest", "/api/latest.json"].includes(path)) {
    return json({ ok: false, error: "screenshot_disabled", message: "小手机不提供截图能力" }, 410);
  }

  return json({ ok: false, error: "LINJIAN_ERR_BAD_METHOD", path }, 404);
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Auth-Token, X-Linjian-Token, MCP-Protocol-Version",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, WWW-Authenticate",
    ...extra
  };
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders })
  });
}
function mcpJson(value, status = 200, protocolVersion = MCP_LEGACY_PROTOCOL_VERSION) {
  return json(value, status, { "MCP-Protocol-Version": protocolVersion });
}

function tokenOk(request, env, url) {
  const expected = String(env.LINJIAN_TOKEN || "");
  if (!expected) return false;
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const supplied = request.headers.get("X-Auth-Token") || request.headers.get("X-Linjian-Token") || bearer || url.searchParams.get("token") || "";
  return supplied === expected;
}


const OAUTH_SCOPE = "little-phone";
const OAUTH_OFFLINE_SCOPE = "offline_access";
const OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
const OAUTH_REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;
const OAUTH_CODE_TTL_SECONDS = 5 * 60;
const CHATGPT_OAUTH_CLIENT_ID = "chatgpt-little-phone";
const OAUTH_PUBLIC_ORIGIN = "https://little-phone-gateway.netlify.app";

function originOf(url) { return `${url.protocol}//${url.host}`; }
function resourceUri(url) { return `${originOf(url)}/mcp`; }
function oauthScopes() { return [OAUTH_SCOPE, OAUTH_OFFLINE_SCOPE]; }
function normalizedScope(value) {
  const allowed = new Set(oauthScopes());
  const parts = String(value || "").split(/\s+/).filter(Boolean).filter(x => allowed.has(x));
  if (!parts.includes(OAUTH_SCOPE)) parts.unshift(OAUTH_SCOPE);
  if (!parts.includes(OAUTH_OFFLINE_SCOPE)) parts.push(OAUTH_OFFLINE_SCOPE);
  return [...new Set(parts)].join(" ");
}
function randomToken(bytes = 32) {
  const raw = new Uint8Array(bytes); crypto.getRandomValues(raw);
  return Array.from(raw, b => b.toString(16).padStart(2,"0")).join("");
}
async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, b => b.toString(16).padStart(2,"0")).join("");
}
function base64Url(bytes) {
  let bin=""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(String(verifier || ""));
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}
function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function oauthError(error, description, status=400) {
  return json({error, error_description:description}, status);
}
function oauth401(url, description="Authentication required") {
  const metadata = `${originOf(url)}/.well-known/oauth-protected-resource/mcp`;
  return new Response(JSON.stringify({error:"invalid_token", error_description:description}), {
    status:401,
    headers:corsHeaders({
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "WWW-Authenticate":`Bearer error="invalid_token", error_description="${description.replace(/"/g,"")}", resource_metadata="${metadata}", scope="${OAUTH_SCOPE} ${OAUTH_OFFLINE_SCOPE}"`
    })
  });
}

async function oauthAccessTokenOk(request, env, url) {
  // Preserve the existing LINJIAN_TOKEN bearer path for the Android app / legacy private plugin.
  if (tokenOk(request, env, url)) return true;
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!bearer) return false;
  const hash = await sha256Hex(bearer);
  const row = await env.DB.prepare("SELECT access_expires_epoch FROM lp_oauth_tokens WHERE access_hash=?").bind(hash).first();
  return Boolean(row && Number(row.access_expires_epoch || 0) > epochSeconds());
}

function oauthProtectedResourceMetadata(url) {
  return json({
    resource: resourceUri(url),
    authorization_servers:[OAUTH_PUBLIC_ORIGIN],
    scopes_supported:oauthScopes(),
    bearer_methods_supported:["header"],
    resource_name:"小手机 MCP"
  });
}
function oauthAuthorizationServerMetadata(url) {
  const origin=OAUTH_PUBLIC_ORIGIN;
  return json({
    issuer:origin,
    authorization_endpoint:`${origin}/authorize`,
    token_endpoint:`${origin}/token`,
    registration_endpoint:`${origin}/register`,
    response_types_supported:["code"],
    grant_types_supported:["authorization_code","refresh_token"],
    code_challenge_methods_supported:["S256"],
    token_endpoint_auth_methods_supported:["none"],
    authorization_response_iss_parameter_supported:true,
    scopes_supported:oauthScopes()
  });
}

async function oauthRegister(request, env, url) {
  if (request.method !== "POST") return oauthError("invalid_request","Use POST /register",405);
  const body = await readJson(request);
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(x=>String(x||"")).filter(Boolean).slice(0,12) : [];
  if (!redirects.length) return oauthError("invalid_client_metadata","redirect_uris is required");
  for (const raw of redirects) {
    let u; try { u=new URL(raw); } catch { return oauthError("invalid_redirect_uri","Invalid redirect URI"); }
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return oauthError("invalid_redirect_uri","Redirect URI must use HTTPS");
  }
  const method = String(body.token_endpoint_auth_method || "none");
  if (method !== "none") return oauthError("invalid_client_metadata","Only public PKCE clients are supported");
  const client_id=`lp_${randomToken(18)}`;
  const client_name=clip(body.client_name || "ChatGPT MCP Client",160);
  const created=epochSeconds();
  await env.DB.prepare("INSERT INTO lp_oauth_clients(client_id,client_name,redirect_uris_json,created_at_epoch) VALUES(?,?,?,?)")
    .bind(client_id,client_name,JSON.stringify(redirects),created).run();
  return json({
    client_id,
    client_id_issued_at:created,
    client_name,
    redirect_uris:redirects,
    token_endpoint_auth_method:"none",
    grant_types:["authorization_code","refresh_token"],
    response_types:["code"]
  },201);
}

function isChatGptOauthRedirect(redirectUri) {
  try {
    const u = new URL(String(redirectUri || ""));
    return u.protocol === "https:" && u.hostname === "chatgpt.com" && (u.pathname.startsWith("/connector/oauth/") || u.pathname === "/connector_platform_oauth_redirect");
  } catch { return false; }
}
async function getOauthClient(env, clientId) {
  if (!clientId) return null;
  if (String(clientId) === CHATGPT_OAUTH_CLIENT_ID) {
    return {
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      client_name: "ChatGPT · 小手机",
      redirect_uris_json: "[]",
      static_chatgpt_client: 1
    };
  }
  return env.DB.prepare("SELECT * FROM lp_oauth_clients WHERE client_id=?").bind(String(clientId)).first();
}
function clientAllowsRedirect(row, redirectUri) {
  if (!row) return false;
  if (Number(row.static_chatgpt_client || 0) === 1) return isChatGptOauthRedirect(redirectUri);
  return safeJson(row.redirect_uris_json,[]).includes(String(redirectUri || ""));
}
function authorizeParams(source) {
  const get = k => source instanceof URLSearchParams ? source.get(k) : source.get(k);
  return {
    client_id:clip(get("client_id")||"",200), redirect_uri:clip(get("redirect_uri")||"",2000),
    response_type:clip(get("response_type")||"",30), scope:clip(get("scope")||"",500), state:clip(get("state")||"",3000),
    code_challenge:clip(get("code_challenge")||"",300), code_challenge_method:clip(get("code_challenge_method")||"",30),
    resource:clip(get("resource")||"",2000)
  };
}
async function validateAuthorize(env,url,p) {
  if (p.response_type !== "code") return {error:"unsupported_response_type",description:"Only authorization code flow is supported"};
  const client=await getOauthClient(env,p.client_id);
  if (!client) return {error:"invalid_request",description:"Unknown OAuth client"};
  if (!clientAllowsRedirect(client,p.redirect_uri)) return {error:"invalid_request",description:"redirect_uri is not registered"};
  if (!p.code_challenge || p.code_challenge_method !== "S256") return {error:"invalid_request",description:"PKCE S256 is required"};
  if (p.resource && p.resource !== resourceUri(url)) return {error:"invalid_target",description:"Invalid OAuth resource"};
  return {client};
}
function authorizeHtml(url,p,clientName,error="",nonce="") {
  const hidden = Object.entries(p).map(([k,v])=>`<input type="hidden" name="${htmlEscape(k)}" value="${htmlEscape(v)}">`).join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>小手机连接授权</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}html,body{min-height:100%;touch-action:manipulation}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;background:radial-gradient(circle at 20% 10%,#eef8ff 0,#eaf2ff 35%,#f6efff 100%);color:#202839}.card{position:relative;width:min(92vw,480px);padding:28px;border-radius:34px;background:rgba(255,255,255,.88);box-shadow:0 22px 80px rgba(92,108,156,.18),inset 0 1px 0 rgba(255,255,255,.9)}h1{font-size:28px;margin:0 0 10px}p{line-height:1.65;color:#677186}.scope{margin:18px 0;padding:16px 18px;border-radius:22px;background:rgba(244,248,255,.82)}form{position:relative;z-index:5}label{display:block;font-size:14px;color:#68748a;margin:18px 0 8px}input[type=password]{position:relative;z-index:6;width:100%;border:1px solid rgba(123,139,174,.25);border-radius:18px;padding:14px 16px;font-size:16px;background:#fff;outline:none}button{position:relative;z-index:8;display:block;width:100%;margin-top:16px;border:0;border-radius:20px;padding:15px 18px;font-size:17px;font-weight:650;background:linear-gradient(110deg,#8eb6ff,#b9a4ec);color:white;cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-appearance:none;appearance:none;user-select:none}button:disabled{opacity:.72}.error{color:#a64e5b;background:#fff0f3;padding:10px 12px;border-radius:14px}.status{min-height:20px;margin-top:10px;font-size:13px;color:#6b7690}.note{font-size:12px;margin-top:8px;color:#8992a5}</style></head><body><main class="card"><h1>连接「小手机」</h1><p><b>${htmlEscape(clientName||"ChatGPT")}</b> 请求连接你的私人小手机 MCP。</p><div class="scope">授权后可按你在 ChatGPT 中确认的操作读取或修改小手机数据。设备状态仍只会在一次“来访”事件中读取，不会持续监控。</div>${error?`<div class="error">${htmlEscape(error)}</div>`:""}<form id="authForm" method="post" action="/authorize">${hidden}<label for="accessKey">小手机连接口令</label><input id="accessKey" type="password" name="access_key" autocomplete="current-password" required placeholder="粘贴小手机里的 Token"><button id="submitBtn" type="submit">允许连接</button><div id="submitStatus" class="status" aria-live="polite"></div></form><div class="note">口令只用于这次授权验证，不会写入 OAuth Token 数据表。</div></main><script nonce="${htmlEscape(nonce)}">(()=>{const f=document.getElementById('authForm'),b=document.getElementById('submitBtn'),s=document.getElementById('submitStatus');if(!f||!b)return;f.addEventListener('submit',()=>{b.disabled=true;b.textContent='正在连接…';if(s)s.textContent='正在提交授权，请稍候…';});b.addEventListener('pointerup',()=>{if(s)s.textContent='正在提交授权…';});})();</script></body></html>`;
}

function jsString(value) {
  return JSON.stringify(String(value || ""))
    .replace(/</g,"\\u003c")
    .replace(/>/g,"\\u003e")
    .replace(/\u2028/g,"\\u2028")
    .replace(/\u2029/g,"\\u2029");
}
function isNetlifyOauthProxy(request) {
  if (request.headers.get("x-nf-netlify-proxy")) return true;
  try { return new URL(request.headers.get("origin") || "").hostname === "little-phone-gateway.netlify.app"; }
  catch { return false; }
}
function oauthReturnHtml(target,nonce) {
  const href=htmlEscape(target), scriptTarget=jsString(target);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${href}"><title>正在返回 ChatGPT</title><style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;background:radial-gradient(circle at 20% 10%,#eef8ff 0,#eaf2ff 35%,#f6efff 100%);color:#202839}.card{width:min(88vw,420px);padding:28px;border-radius:30px;background:rgba(255,255,255,.9);box-shadow:0 22px 80px rgba(92,108,156,.18);text-align:center}p{color:#677186;line-height:1.65}a{display:block;margin-top:18px;padding:14px 18px;border-radius:18px;background:linear-gradient(110deg,#8eb6ff,#b9a4ec);color:#fff;text-decoration:none;font-weight:650}</style></head><body><main class="card"><h1>授权成功</h1><p>正在返回 ChatGPT…</p><a id="continueLink" href="${href}">没有自动返回？点这里继续</a></main><script nonce="${htmlEscape(nonce)}">window.location.replace(${scriptTarget});</script></body></html>`;
}
async function oauthAuthorize(request,env,url) {
  if (request.method === "GET") {
    const p=authorizeParams(url.searchParams); const valid=await validateAuthorize(env,url,p);
    if (valid.error) return oauthError(valid.error,valid.description,400);
    { const nonce=randomToken(12); return new Response(authorizeHtml(url,p,valid.client.client_name,"",nonce),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}}); }
  }
  if (request.method !== "POST") return oauthError("invalid_request","Use GET or POST /authorize",405);
  const form=await request.formData(); const p=authorizeParams(form); const valid=await validateAuthorize(env,url,p);
  if (valid.error) return oauthError(valid.error,valid.description,400);
  const expected=String(env.LINJIAN_TOKEN||"").trim(); const supplied=String(form.get("access_key")||"").trim();
  if (!expected || supplied !== expected) { const nonce=randomToken(12); return new Response(authorizeHtml(url,p,valid.client.client_name,"连接口令不正确",nonce),{status:401,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}}); }
  const code=randomToken(32), codeHash=await sha256Hex(code), exp=epochSeconds()+OAUTH_CODE_TTL_SECONDS;
  await env.DB.prepare("DELETE FROM lp_oauth_codes WHERE expires_at_epoch<=?").bind(epochSeconds()).run();
  await env.DB.prepare("INSERT INTO lp_oauth_codes(code_hash,client_id,redirect_uri,code_challenge,scope,resource,expires_at_epoch) VALUES(?,?,?,?,?,?,?)")
    .bind(codeHash,p.client_id,p.redirect_uri,p.code_challenge,normalizedScope(p.scope),p.resource||resourceUri(url),exp).run();
  const redirect=new URL(p.redirect_uri); redirect.searchParams.set("code",code); redirect.searchParams.set("iss",OAUTH_PUBLIC_ORIGIN); if(p.state)redirect.searchParams.set("state",p.state);
  if (isNetlifyOauthProxy(request)) {
    const nonce=randomToken(12);
    return new Response(oauthReturnHtml(redirect.toString(),nonce),{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Pragma":"no-cache","Content-Security-Policy":`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`}});
  }
  return new Response(null,{status:302,headers:{Location:redirect.toString(),"Cache-Control":"no-store","Pragma":"no-cache"}});
}

async function issueOauthTokens(env,{client_id,scope,resource}) {
  const access_token=randomToken(32), refresh_token=randomToken(40), now=epochSeconds();
  const access_hash=await sha256Hex(access_token), refresh_hash=await sha256Hex(refresh_token);
  const access_exp=now+OAUTH_ACCESS_TTL_SECONDS, refresh_exp=now+OAUTH_REFRESH_TTL_SECONDS;
  await env.DB.prepare("INSERT INTO lp_oauth_tokens(access_hash,refresh_hash,client_id,scope,resource,access_expires_epoch,refresh_expires_epoch,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(access_hash,refresh_hash,client_id,scope,resource,access_exp,refresh_exp,nowIso()).run();
  return {access_token,token_type:"Bearer",expires_in:OAUTH_ACCESS_TTL_SECONDS,refresh_token,scope};
}
async function oauthToken(request,env,url) {
  if (request.method !== "POST") return oauthError("invalid_request","Use POST /token",405);
  let form; try { form=await request.formData(); } catch { return oauthError("invalid_request","Form encoded token request required"); }
  const grant=String(form.get("grant_type")||""), client_id=String(form.get("client_id")||"");
  const client=await getOauthClient(env,client_id); if(!client)return oauthError("invalid_client","Unknown client",401);
  if(grant==="authorization_code"){
    const code=String(form.get("code")||""), redirect_uri=String(form.get("redirect_uri")||""), verifier=String(form.get("code_verifier")||"");
    if(!code||!redirect_uri||!verifier)return oauthError("invalid_request","code, redirect_uri and code_verifier are required");
    const row=await env.DB.prepare("SELECT * FROM lp_oauth_codes WHERE code_hash=?").bind(await sha256Hex(code)).first();
    if(!row||row.client_id!==client_id||row.redirect_uri!==redirect_uri||Number(row.expires_at_epoch||0)<=epochSeconds())return oauthError("invalid_grant","Authorization code is invalid or expired");
    if(await pkceChallenge(verifier)!==row.code_challenge)return oauthError("invalid_grant","PKCE verification failed");
    await env.DB.prepare("DELETE FROM lp_oauth_codes WHERE code_hash=?").bind(await sha256Hex(code)).run();
    return json(await issueOauthTokens(env,{client_id,scope:row.scope,resource:row.resource}));
  }
  if(grant==="refresh_token"){
    const refresh=String(form.get("refresh_token")||""); if(!refresh)return oauthError("invalid_request","refresh_token is required");
    const hash=await sha256Hex(refresh), row=await env.DB.prepare("SELECT * FROM lp_oauth_tokens WHERE refresh_hash=?").bind(hash).first();
    if(!row||row.client_id!==client_id||Number(row.refresh_expires_epoch||0)<=epochSeconds())return oauthError("invalid_grant","Refresh token is invalid or expired");
    await env.DB.prepare("DELETE FROM lp_oauth_tokens WHERE refresh_hash=?").bind(hash).run();
    return json(await issueOauthTokens(env,{client_id,scope:row.scope,resource:row.resource}));
  }
  return oauthError("unsupported_grant_type","Supported grants: authorization_code, refresh_token");
}

function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); }
function epochSeconds() { return Math.floor(Date.now() / 1000); }
function clip(value, max) { return String(value ?? "").slice(0, max); }
function asLimit(url, fallback, max) { return Math.max(1, Math.min(max, Number(url.searchParams.get("limit") || fallback) || fallback)); }
function boolInt(v) { return v ? 1 : 0; }
function safeJson(value, fallback = {}) { try { return JSON.parse(value || ""); } catch { return fallback; } }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function actorFromAuthor(author) { return ["daddy", "gpt", "companion"].includes(String(author || "").toLowerCase()) ? "daddy" : "user"; }
function uuid() { return crypto.randomUUID(); }
function clientId(body) {
  const v=clip(body?.client_id||body?.id||"",100).trim();
  return /^[A-Za-z0-9_.:-]{8,100}$/.test(v) ? v : uuid();
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error("missing D1 binding: DB");
  if (!schemaReady) {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS lp_commands (
        id TEXT PRIMARY KEY, device_id TEXT NOT NULL, action TEXT NOT NULL,
        command_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL, dispatched_at TEXT, completed_at TEXT, result TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_commands_pending ON lp_commands(device_id,status,created_at)`,
      `CREATE TABLE IF NOT EXISTS lp_visits (
        id TEXT PRIMARY KEY, command_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
        visitor TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        expires_at_epoch INTEGER NOT NULL, snapshot_json TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_visits_device_created ON lp_visits(device_id,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_events (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        expires_at_epoch INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_events_expiry ON lp_events(expires_at_epoch)`,
      `CREATE INDEX IF NOT EXISTS idx_lp_events_created ON lp_events(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_papers (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL, reply_to TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_papers_created ON lp_papers(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_mail (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'letter', reply_to TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0,
        user_seen INTEGER NOT NULL DEFAULT 0, daddy_seen INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_mail_created ON lp_mail(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_capsules (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL,
        created_at TEXT NOT NULL, unlock_at TEXT NOT NULL,
        user_seen INTEGER NOT NULL DEFAULT 0, daddy_seen INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_capsules_created ON lp_capsules(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_dailybook (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, title TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL, created_at TEXT NOT NULL,
        images_json TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_dailybook_date ON lp_dailybook(event_date DESC,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_diaries (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
        event_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_diaries_date ON lp_diaries(event_date DESC,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_todos (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, title TEXT NOT NULL,
        due_at TEXT NOT NULL DEFAULT '', remind_at TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_todos_created ON lp_todos(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_dates (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, event_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'important',
        remind_days INTEGER NOT NULL DEFAULT 3, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_dates_date ON lp_dates(event_date ASC)`,
      `CREATE TABLE IF NOT EXISTS lp_cycle_settings (
        id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, last_start TEXT NOT NULL DEFAULT '',
        cycle_length INTEGER NOT NULL DEFAULT 30, period_length INTEGER NOT NULL DEFAULT 6,
        remind_before INTEGER NOT NULL DEFAULT 3, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lp_cycle_records (
        id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_cycle_records_start ON lp_cycle_records(start_date DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_statuses (
        actor TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '', presence TEXT NOT NULL DEFAULT 'online',
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lp_calls (
        id TEXT PRIMARY KEY, caller TEXT NOT NULL DEFAULT 'daddy', prompt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ringing', note TEXT NOT NULL DEFAULT '', target_package TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_calls_created ON lp_calls(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_health_summary (
        id TEXT PRIMARY KEY, connected INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'not_connected',
        sleep_json TEXT NOT NULL DEFAULT 'null', steps_json TEXT NOT NULL DEFAULT 'null',
        heart_rate_json TEXT NOT NULL DEFAULT 'null', cycle_json TEXT NOT NULL DEFAULT 'null',
        updated_at TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS lp_profiles (
        actor TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '',
        identity_color TEXT NOT NULL DEFAULT '', identity_font TEXT NOT NULL DEFAULT 'clean', updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lp_memories (
        id TEXT PRIMARY KEY, author TEXT NOT NULL DEFAULT 'daddy', content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'noticed', confidence TEXT NOT NULL DEFAULT 'remembered',
        confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_memories_created ON lp_memories(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_unlock_requests (
        id TEXT PRIMARY KEY, device_id TEXT NOT NULL DEFAULT 'android-phone', package_name TEXT NOT NULL, app_name TEXT NOT NULL DEFAULT '',
        requester TEXT NOT NULL DEFAULT 'user', reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
        response TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_unlock_requests_created ON lp_unlock_requests(created_at DESC)`
,
      `CREATE TABLE IF NOT EXISTS lp_oauth_clients (
        client_id TEXT PRIMARY KEY, client_name TEXT NOT NULL DEFAULT '', redirect_uris_json TEXT NOT NULL, created_at_epoch INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lp_oauth_codes (
        code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL,
        scope TEXT NOT NULL, resource TEXT NOT NULL, expires_at_epoch INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_oauth_codes_expiry ON lp_oauth_codes(expires_at_epoch)`,
      `CREATE TABLE IF NOT EXISTS lp_oauth_tokens (
        access_hash TEXT PRIMARY KEY, refresh_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, scope TEXT NOT NULL, resource TEXT NOT NULL,
        access_expires_epoch INTEGER NOT NULL, refresh_expires_epoch INTEGER NOT NULL, created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_oauth_tokens_refresh ON lp_oauth_tokens(refresh_hash)`
    ];
    schemaReady = Promise.all(ddl.map(sql => env.DB.prepare(sql).run())).then(async () => {
      const alters = [
        "ALTER TABLE lp_papers ADD COLUMN reply_to TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE lp_mail ADD COLUMN user_seen INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lp_mail ADD COLUMN daddy_seen INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lp_capsules ADD COLUMN user_seen INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lp_capsules ADD COLUMN daddy_seen INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lp_profiles ADD COLUMN identity_font TEXT NOT NULL DEFAULT 'clean'"
      ];
      for (const sql of alters) { try { await env.DB.prepare(sql).run(); } catch (e) { if (!String(e).toLowerCase().includes("duplicate column")) throw e; } }
      // v0.5.2 single seen meant the phone user had opened the letter. Preserve that truth,
      // and mark the sender's own side as known without inventing recipient reads.
      await env.DB.prepare("UPDATE lp_mail SET daddy_seen=1 WHERE lower(author) IN ('daddy','gpt','companion')").run();
      await env.DB.prepare("UPDATE lp_mail SET user_seen=1 WHERE lower(author) NOT IN ('daddy','gpt','companion')").run();
      await env.DB.prepare("UPDATE lp_mail SET user_seen=1 WHERE seen=1").run();
      await env.DB.prepare("UPDATE lp_capsules SET daddy_seen=1 WHERE lower(author) IN ('daddy','gpt','companion')").run();
      await env.DB.prepare("UPDATE lp_capsules SET user_seen=1 WHERE lower(author) NOT IN ('daddy','gpt','companion')").run();
    }).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

async function pruneEvents(env) {
  await env.DB.prepare("DELETE FROM lp_events WHERE expires_at_epoch<=?").bind(epochSeconds()).run();
}

async function insertEvent(env, { actor = "user", type = "event", title = "", content = "", metadata = {} } = {}) {
  await pruneEvents(env);
  const normalizedActor = actor === "daddy" ? "daddy" : "user";
  const normalizedType = clip(type, 40), normalizedTitle = clip(title, 120), normalizedContent = clip(content, 1000);
  const eventKey = clip(metadata?.event_key || "", 160);
  if (!metadata?.force) {
    const cutoff = new Date(Date.now() - 4000).toISOString().replace(/\.\d{3}Z$/, "Z");
    let prev = null;
    if (eventKey) {
      const rows = await env.DB.prepare("SELECT * FROM lp_events WHERE actor=? AND type=? AND created_at>=? ORDER BY created_at DESC LIMIT 12").bind(normalizedActor, normalizedType, cutoff).all();
      prev = (rows.results || []).find(r => safeJson(r.metadata_json,{}).event_key === eventKey) || null;
    } else {
      prev = await env.DB.prepare("SELECT * FROM lp_events WHERE actor=? AND type=? AND title=? AND content=? AND created_at>=? ORDER BY created_at DESC LIMIT 1").bind(normalizedActor, normalizedType, normalizedTitle, normalizedContent, cutoff).first();
    }
    if (prev) return rowEvent(prev);
  }
  const createdAt = nowIso();
  const expiresEpoch = epochSeconds() + EVENT_TTL_SECONDS;
  const expiresAt = new Date(expiresEpoch * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const item = {
    id: uuid(), actor: normalizedActor,
    type: normalizedType, title: normalizedTitle, content: normalizedContent,
    created_at: createdAt, expires_at: expiresAt, expires_at_epoch: expiresEpoch,
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  };
  await env.DB.prepare(`INSERT INTO lp_events(id,actor,type,title,content,created_at,expires_at,expires_at_epoch,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(item.id,item.actor,item.type,item.title,item.content,item.created_at,item.expires_at,item.expires_at_epoch,JSON.stringify(item.metadata)).run();
  return item;
}

function rowEvent(r) {
  return { id:r.id, actor:r.actor, type:r.type, title:r.title, content:r.content, created_at:r.created_at, expires_at:r.expires_at, expires_at_epoch:r.expires_at_epoch, metadata:safeJson(r.metadata_json,{}) };
}

async function listEvents(env, limit = 80) {
  await pruneEvents(env);
  const rows = await env.DB.prepare("SELECT * FROM lp_events ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return (rows.results || []).map(rowEvent);
}

async function addManualEventApi(env, body) {
  const author = clip(body.author || "瑞安", 40);
  const title = clip(body.title || `${author} 留下一条痕迹`, 120);
  const content = clip(body.content || "", 1000);
  const event = await insertEvent(env, { actor: actorFromAuthor(author), type:"manual", title, content, metadata:{ source:"littlephone" } });
  return json({ ok:true, event });
}

async function listEventsApi(env, url) { return json({ ok:true, events:await listEvents(env, asLimit(url,80,300)) }); }

async function addPaper(env, body) {
  const content = clip(body.content || "", 800).trim();
  if (!content) return { error:"content_required" };
  const id=clientId(body); const existing=await env.DB.prepare("SELECT * FROM lp_papers WHERE id=?").bind(id).first();
  if(existing)return existing;
  const item = { id, author:clip(body.author || "用户",40), content, reply_to:clip(body.reply_to||"",100), created_at:nowIso() };
  const wr=await env.DB.prepare("INSERT OR IGNORE INTO lp_papers(id,author,content,reply_to,created_at) VALUES(?,?,?,?,?)").bind(item.id,item.author,item.content,item.reply_to,item.created_at).run();
  if(Number(wr.meta?.changes??0)>0)await insertEvent(env,{actor:actorFromAuthor(item.author),type:"paper",title:`${item.author} 留下一张纸条`,content:item.content,metadata:{paper_id:item.id}});
  return (await env.DB.prepare("SELECT * FROM lp_papers WHERE id=?").bind(id).first())||item;
}
async function addPaperApi(env, body) { const item=await addPaper(env,body); return item.error?json({ok:false,error:item.error},400):json({ok:true,paper:item}); }
async function listPapers(env, limit=200) { const rows=await env.DB.prepare("SELECT * FROM lp_papers ORDER BY created_at DESC LIMIT ?").bind(limit).all(); return rows.results||[]; }
async function listPapersApi(env,url){ return json({ok:true,papers:await listPapers(env,asLimit(url,200,500))}); }

async function addMail(env, body) {
  const content=clip(body.content||"",6000).trim();
  if(!content) return {error:"content_required"};
  const id=clientId(body); const existing=await env.DB.prepare("SELECT * FROM lp_mail WHERE id=?").bind(id).first();
  if(existing)return rowMail(existing);
  const author=clip(body.author||"用户",40), actor=actorFromAuthor(author);
  const item={id,author,content,kind:"letter",reply_to:clip(body.reply_to||"",80),created_at:nowIso(),seen:false,user_seen:actor==="user",daddy_seen:actor==="daddy"};
  const wr=await env.DB.prepare("INSERT OR IGNORE INTO lp_mail(id,author,content,kind,reply_to,created_at,seen,user_seen,daddy_seen) VALUES(?,?,?,?,?,?,0,?,?)").bind(item.id,item.author,item.content,item.kind,item.reply_to,item.created_at,boolInt(item.user_seen),boolInt(item.daddy_seen)).run();
  if(Number(wr.meta?.changes??0)>0)await insertEvent(env,{actor:actorFromAuthor(item.author),type:"mail",title:`${item.author} 投递了一封信`,content:item.content.slice(0,240),metadata:{mail_id:item.id}});
  const row=await env.DB.prepare("SELECT * FROM lp_mail WHERE id=?").bind(id).first();return row?rowMail(row):item;
}
function rowMail(r){return {...r,seen:Boolean(r.seen),user_seen:Boolean(r.user_seen),daddy_seen:Boolean(r.daddy_seen)};}
async function addMailApi(env,body){ const item=await addMail(env,body); return item.error?json({ok:false,error:item.error},400):json({ok:true,mail:item}); }
async function listMail(env,limit=80){ const rows=await env.DB.prepare("SELECT * FROM lp_mail ORDER BY created_at DESC LIMIT ?").bind(limit).all(); return (rows.results||[]).map(rowMail); }
async function listMailApi(env,url){ return json({ok:true,mail:await listMail(env,asLimit(url,80,300))}); }
async function markMailSeen(env,body,defaultActor="user"){
  const id=clip(body.id||"",100), actor=String(body.actor||defaultActor).toLowerCase()==="daddy"?"daddy":"user";
  const col=actor==="daddy"?"daddy_seen":"user_seen"; let res;
  if(id) res=await env.DB.prepare(`UPDATE lp_mail SET ${col}=1${actor==="user"?", seen=1":""} WHERE id=? AND ${col}=0`).bind(id).run();
  else res=await env.DB.prepare(`UPDATE lp_mail SET ${col}=1${actor==="user"?", seen=1":""} WHERE ${col}=0`).run();
  const changed=Number(res.meta?.changes ?? res.changes ?? 0);
  if(changed>0) await insertEvent(env,{actor,type:"mail_open",title:actor==="daddy"?"daddy 拆开了一封信":"瑞安拆开了一封信",content:"",metadata:{mail_id:id,event_key:`mail_open:${actor}:${id}`}});
  return {ok:true,marked:changed,actor};
}
async function markMailSeenApi(env,body){ return json(await markMailSeen(env,body,"user")); }

function todayUtc(){ return new Date().toISOString().slice(0,10); }
async function addCapsule(env,body){
  const content=clip(body.content||"",8000).trim(); if(!content)return {error:"content_required"};
  let unlock=clip(body.unlock_at||"",32); if(!/^\d{4}-\d{2}-\d{2}$/.test(unlock)){const d=new Date(Date.now()+86400000);unlock=d.toISOString().slice(0,10)}
  const author=clip(body.author||"用户",40),actor=actorFromAuthor(author);
  const item={id:uuid(),author,content,created_at:nowIso(),unlock_at:unlock,user_seen:actor==="user",daddy_seen:actor==="daddy"};
  await env.DB.prepare("INSERT INTO lp_capsules(id,author,content,created_at,unlock_at,user_seen,daddy_seen) VALUES(?,?,?,?,?,?,?)").bind(item.id,item.author,item.content,item.created_at,item.unlock_at,boolInt(item.user_seen),boolInt(item.daddy_seen)).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"capsule",title:`${item.author} 放入一封未来信`,content:"",metadata:{capsule_id:item.id,unlock_at:item.unlock_at}});
  return item;
}
async function addCapsuleApi(env,body){const item=await addCapsule(env,body);if(item.error)return json({ok:false,error:item.error},400);const out={...item,locked:true};delete out.content;return json({ok:true,capsule:out});}
async function listCapsules(env,limit=30){
  const rows=await env.DB.prepare("SELECT * FROM lp_capsules ORDER BY created_at DESC LIMIT ?").bind(limit).all(); const today=todayUtc();
  return (rows.results||[]).map(r=>{const locked=String(r.unlock_at||"9999-12-31")>today;const item={...r,locked,user_seen:Boolean(r.user_seen),daddy_seen:Boolean(r.daddy_seen)};if(locked)delete item.content;return item;});
}
async function listCapsulesApi(env,url){return json({ok:true,capsules:await listCapsules(env,asLimit(url,30,100))});}
async function markCapsuleSeen(env,body,defaultActor="user"){
  const id=clip(body.id||"",100),actor=String(body.actor||defaultActor).toLowerCase()==="daddy"?"daddy":"user";
  if(!id)return {ok:false,error:"id_required"};
  const row=await env.DB.prepare("SELECT unlock_at FROM lp_capsules WHERE id=?").bind(id).first();
  if(!row)return {ok:false,error:"not_found"};
  if(String(row.unlock_at||"9999-12-31")>todayUtc())return {ok:false,error:"capsule_locked"};
  const col=actor==="daddy"?"daddy_seen":"user_seen";
  const res=await env.DB.prepare(`UPDATE lp_capsules SET ${col}=1 WHERE id=? AND ${col}=0`).bind(id).run();
  const changed=Number(res.meta?.changes??0);
  if(changed>0)await insertEvent(env,{actor,type:"capsule_open",title:actor==="daddy"?"daddy 拆开了一封未来信":"瑞安拆开了一封未来信",metadata:{capsule_id:id,event_key:`capsule_open:${actor}:${id}`}});
  return {ok:true,marked:changed,actor};
}
async function markCapsuleSeenApi(env,body){const r=await markCapsuleSeen(env,body,"user");return json(r,r.ok?200:(r.error==="capsule_locked"?423:400));}

function dataUrlParts(value){ const m=String(value||"").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/s); return m?{mime:m[1]==="image/jpg"?"image/jpeg":m[1],base64:m[2]}:null; }
function base64ToBytes(b64){ const bin=atob(b64); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i); return out; }
function extForMime(mime){return mime.includes("png")?"png":mime.includes("webp")?"webp":"jpg";}
async function normalizeDailyImages(env, entryId, images){
  const out=[]; const warnings=[]; const arr=Array.isArray(images)?images.slice(0,9):[];
  for(let i=0;i<arr.length;i++){
    const raw=typeof arr[i]==="string"?{data:arr[i]}:(arr[i]||{});
    const remote=clip(raw.url||"",1000).trim();
    if(remote){out.push({url:remote,kind:"remote"});continue;}
    const parts=dataUrlParts(raw.data||raw.base64||"");
    if(!parts){warnings.push(`image_${i+1}_invalid`);continue;}
    const bytes=base64ToBytes(parts.base64);
    if(bytes.byteLength>6*1024*1024){warnings.push(`image_${i+1}_too_large`);continue;}
    if(!env.LITTLEPHONE_MEDIA){
      // 私人小手机没有配置 R2 时，回退到 D1 行内保存。前端已压缩图片；
      // 单张超过 1.5MB 则拒绝，避免把 D1 行做得过大。
      if(bytes.byteLength>1536*1024){warnings.push(`image_${i+1}_too_large_for_inline`);continue;}
      out.push({url:`data:${parts.mime};base64,${parts.base64}`,kind:"inline",mime:parts.mime});
      continue;
    }
    const key=`${entryId}/${uuid()}.${extForMime(parts.mime)}`;
    await env.LITTLEPHONE_MEDIA.put(key,bytes,{httpMetadata:{contentType:parts.mime}});
    out.push({url:`/media/littlephone/${key}`,kind:"r2",mime:parts.mime});
  }
  return {images:out,warnings};
}
async function getMedia(env,key){
  if(!env.LITTLEPHONE_MEDIA||!key)return json({ok:false,error:"not_found"},404);
  const obj=await env.LITTLEPHONE_MEDIA.get(key); if(!obj)return json({ok:false,error:"not_found"},404);
  const headers=new Headers(); obj.writeHttpMetadata(headers); headers.set("Cache-Control","private, max-age=86400"); return new Response(obj.body,{headers});
}
async function addDailybook(env,body){
  const title=clip(body.title||"今天",120).trim()||"今天"; const content=clip(body.content||"",12000); const rawImages=Array.isArray(body.images)?body.images:[];
  if(!content.trim()&&!rawImages.length)return {error:"content_required"};
  const id=uuid(); const media=await normalizeDailyImages(env,id,rawImages);
  const item={id,author:clip(body.author||"用户",40),title,mood:clip(body.mood||"",40),content,event_date:clip(body.date||todayUtc(),20),date:clip(body.date||todayUtc(),20),created_at:nowIso(),images:media.images};
  await env.DB.prepare("INSERT INTO lp_dailybook(id,author,title,mood,content,event_date,created_at,images_json) VALUES(?,?,?,?,?,?,?,?)").bind(item.id,item.author,item.title,item.mood,item.content,item.event_date,item.created_at,JSON.stringify(item.images)).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"dailybook",title:`${item.author} 写入日常册`,content:item.title,metadata:{entry_id:item.id}});
  if(media.warnings.length)item.media_warnings=media.warnings;
  return item;
}
function rowDaily(r){return {id:r.id,author:r.author,title:r.title,mood:r.mood,content:r.content,date:r.event_date,created_at:r.created_at,images:safeJson(r.images_json,[])};}
async function addDailybookApi(env,body){const item=await addDailybook(env,body);return item.error?json({ok:false,error:item.error},400):json({ok:true,entry:item});}
async function listDailybook(env,limit=100){const rows=await env.DB.prepare("SELECT * FROM lp_dailybook ORDER BY event_date ASC,created_at ASC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowDaily);}
async function listDailybookApi(env,url){return json({ok:true,entries:await listDailybook(env,asLimit(url,100,300))});}
async function updateDailybook(env,body,editor="user"){
  const id=clip(body.id||"",100);const old=await env.DB.prepare("SELECT * FROM lp_dailybook WHERE id=?").bind(id).first();if(!old)return {error:"not_found"};
  if(actorFromAuthor(old.author)!==editor)return {error:"forbidden"};
  const title=body.title!==undefined?(clip(body.title||"",120).trim()||old.title):old.title;
  const mood=body.mood!==undefined?clip(body.mood||"",40):old.mood;
  const content=body.content!==undefined?clip(body.content||"",12000):old.content;
  const date=body.date!==undefined?clip(body.date||"",20):old.event_date;if(!validDate(date))return {error:"invalid_date"};
  await env.DB.prepare("UPDATE lp_dailybook SET title=?,mood=?,content=?,event_date=? WHERE id=?").bind(title,mood,content,date,id).run();
  return rowDaily(await env.DB.prepare("SELECT * FROM lp_dailybook WHERE id=?").bind(id).first());
}
async function updateDailybookApi(env,body){const item=await updateDailybook(env,body,"user");return item.error?json({ok:false,error:item.error},item.error==="forbidden"?403:404):json({ok:true,entry:item});}

function rowDiary(r){return {id:r.id,author:r.author,title:r.title,content:r.content,date:r.event_date,created_at:r.created_at,updated_at:r.updated_at};}
async function listDiaries(env,limit=100){const rows=await env.DB.prepare("SELECT * FROM lp_diaries ORDER BY event_date DESC,created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowDiary);}
async function listDiariesApi(env,url){return json({ok:true,diaries:await listDiaries(env,asLimit(url,100,300))});}
async function addDiary(env,body){const title=clip(body.title||"今天",160).trim()||"今天",content=clip(body.content||"",20000).trim(),date=clip(body.date||todayUtc(),20),author=clip(body.author||"daddy",40);if(!content)return {error:"content_required"};if(!validDate(date))return {error:"invalid_date"};const now=nowIso(),item={id:uuid(),author,title,content,date,created_at:now,updated_at:now};await env.DB.prepare("INSERT INTO lp_diaries(id,author,title,content,event_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(item.id,item.author,item.title,item.content,item.date,item.created_at,item.updated_at).run();await insertEvent(env,{actor:actorFromAuthor(item.author),type:"diary",title:`${item.author} 写了一篇日记`,content:item.title,metadata:{diary_id:item.id}});return item;}
async function addDiaryApi(env,body){const item=await addDiary(env,body);return item.error?json({ok:false,error:item.error},400):json({ok:true,diary:item});}
async function updateDiaryApi(env,body){const id=clip(body.id||"",100),old=await env.DB.prepare("SELECT * FROM lp_diaries WHERE id=?").bind(id).first();if(!old)return json({ok:false,error:"not_found"},404);const title=clip(body.title!==undefined?body.title:old.title,160).trim()||old.title,content=clip(body.content!==undefined?body.content:old.content,20000).trim(),date=clip(body.date!==undefined?body.date:old.event_date,20);if(!content)return json({ok:false,error:"content_required"},400);if(!validDate(date))return json({ok:false,error:"invalid_date"},400);const now=nowIso();await env.DB.prepare("UPDATE lp_diaries SET title=?,content=?,event_date=?,updated_at=? WHERE id=?").bind(title,content,date,now,id).run();return json({ok:true,diary:rowDiary(await env.DB.prepare("SELECT * FROM lp_diaries WHERE id=?").bind(id).first())});}

async function bootstrapApi(env){
  const [visit,events,papers,mail,capsules,dailybook,diaries,todos,dates,cycle,statuses,calls,health,profiles,memories,unlock_requests]=await Promise.all([latestVisit(env,DEFAULT_DEVICE),listEvents(env,160),listPapers(env,300),listMail(env,120),listCapsules(env,80),listDailybook(env,160),listDiaries(env,120),listTodos(env,160),listDates(env,300),cycleProjection(await cycleSettings(env),await listCycleRecords(env,120)),getStatuses(env),listCalls(env,80),healthSummary(env),getProfiles(env),listMemories(env,80),listUnlockRequests(env,30)]);
  return json({ok:true,visit,events,papers,mail,capsules,dailybook,diaries,todos,dates,cycle,statuses,calls,health,profiles,memories,unlock_requests});
}

function rowTodo(r){return {...r,done:Boolean(r.done)};}
async function addTodo(env,body){
  const title=clip(body.title||body.content||"",240).trim();if(!title)return {error:"title_required"}; const now=nowIso();
  const item={id:uuid(),author:clip(body.author||"用户",40),title,due_at:clip(body.due_at||"",40),remind_at:clip(body.remind_at||"",40),done:false,created_at:now,updated_at:now};
  await env.DB.prepare("INSERT INTO lp_todos(id,author,title,due_at,remind_at,done,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)").bind(item.id,item.author,item.title,item.due_at,item.remind_at,item.created_at,item.updated_at).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"todo",title:`${item.author} 添加待办`,content:item.title,metadata:{todo_id:item.id}}); return item;
}
async function addTodoApi(env,body){const item=await addTodo(env,body);return item.error?json({ok:false,error:item.error},400):json({ok:true,todo:item});}
async function listTodos(env,limit=100){const rows=await env.DB.prepare("SELECT * FROM lp_todos ORDER BY done ASC, created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowTodo);}
async function listTodosApi(env,url){return json({ok:true,todos:await listTodos(env,asLimit(url,100,300))});}
async function getTodo(env,id){const row=await env.DB.prepare("SELECT * FROM lp_todos WHERE id=?").bind(id).first();return row?rowTodo(row):null;}
async function toggleTodoApi(env,body){const id=clip(body.id||"",100);if(!id)return json({ok:false,error:"todo_not_found"},404);const now=nowIso();const r=await env.DB.prepare("UPDATE lp_todos SET done=?,updated_at=? WHERE id=?").bind(boolInt(Boolean(body.done)),now,id).run();if(Number(r.meta?.changes??0)<1)return json({ok:false,error:"todo_not_found"},404);return json({ok:true,todo:await getTodo(env,id)});}
async function updateTodo(env,body){
  const id=clip(body.id||"",100); const old=await getTodo(env,id); if(!old)return null;
  const title=body.title!==undefined?(clip(body.title||"",240).trim()||old.title):old.title;
  const due=body.due_at!==undefined?clip(body.due_at||"",40):old.due_at; const remind=body.remind_at!==undefined?clip(body.remind_at||"",40):old.remind_at; const now=nowIso();
  await env.DB.prepare("UPDATE lp_todos SET title=?,due_at=?,remind_at=?,updated_at=? WHERE id=?").bind(title,due,remind,now,id).run(); return getTodo(env,id);
}
async function updateTodoApi(env,body){const item=await updateTodo(env,body);return item?json({ok:true,todo:item}):json({ok:false,error:"todo_not_found"},404);}


async function deleteRowApi(env, table, body){
  const allowed=new Set(["lp_events","lp_papers","lp_mail","lp_capsules","lp_diaries","lp_todos","lp_dates","lp_cycle_records","lp_calls","lp_memories"]);
  if(!allowed.has(table))return json({ok:false,error:"delete_not_allowed"},400);
  const id=clip(body.id||"",100);if(!id)return json({ok:false,error:"id_required"},400);
  const r=await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
  const changes=Number(r.meta?.changes??r.changes??0);return changes?json({ok:true,deleted:id}):json({ok:false,error:"not_found"},404);
}
async function deleteDailybookApi(env,body){
  const id=clip(body.id||"",100);if(!id)return json({ok:false,error:"id_required"},400);
  const row=await env.DB.prepare("SELECT images_json FROM lp_dailybook WHERE id=?").bind(id).first();
  if(!row)return json({ok:false,error:"not_found"},404);
  if(env.LITTLEPHONE_MEDIA){for(const im of safeJson(row.images_json,[])){const u=String(im?.url||"");const prefix="/media/littlephone/";if(u.startsWith(prefix)){try{await env.LITTLEPHONE_MEDIA.delete(u.slice(prefix.length));}catch{}}}}
  await env.DB.prepare("DELETE FROM lp_dailybook WHERE id=?").bind(id).run();return json({ok:true,deleted:id});
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||""));}
function rowDate(r){return {id:r.id,title:r.title,date:r.event_date,kind:r.kind,remind_days:Number(r.remind_days||0),note:r.note||"",created_at:r.created_at,updated_at:r.updated_at};}
async function listDates(env,limit=300){const rows=await env.DB.prepare("SELECT * FROM lp_dates ORDER BY event_date ASC, created_at ASC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowDate);}
async function listDatesApi(env,url){return json({ok:true,dates:await listDates(env,asLimit(url,300,500))});}
async function addDateApi(env,body){
  const title=clip(body.title||"",120).trim(),date=clip(body.date||body.event_date||"",20);if(!title||!validDate(date))return json({ok:false,error:"title_and_date_required"},400);
  const id=clientId(body),existing=await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first();if(existing)return json({ok:true,date:rowDate(existing),deduped:true});
  const now=nowIso(),item={id,title,date,kind:clip(body.kind||"important",40),remind_days:Math.max(0,Math.min(60,Number(body.remind_days??3)||0)),note:clip(body.note||"",500),created_at:now,updated_at:now};
  if(item.kind==="relationship_start")await env.DB.prepare("UPDATE lp_dates SET kind='important',updated_at=? WHERE kind='relationship_start'").bind(now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO lp_dates(id,title,event_date,kind,remind_days,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(item.id,item.title,item.date,item.kind,item.remind_days,item.note,item.created_at,item.updated_at).run();
  return json({ok:true,date:rowDate(await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first())});
}
async function updateDateApi(env,body){
  const id=clip(body.id||"",100);const old=await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first();if(!old)return json({ok:false,error:"not_found"},404);
  const title=body.title!==undefined?(clip(body.title||"",120).trim()||old.title):old.title,date=body.date!==undefined?clip(body.date||"",20):old.event_date;if(!validDate(date))return json({ok:false,error:"invalid_date"},400);
  const kind=body.kind!==undefined?clip(body.kind||"important",40):old.kind,remind=Math.max(0,Math.min(60,Number(body.remind_days??old.remind_days)||0)),note=body.note!==undefined?clip(body.note||"",500):old.note,now=nowIso();
  if(kind==="relationship_start")await env.DB.prepare("UPDATE lp_dates SET kind='important',updated_at=? WHERE kind='relationship_start' AND id<>?").bind(now,id).run();
  await env.DB.prepare("UPDATE lp_dates SET title=?,event_date=?,kind=?,remind_days=?,note=?,updated_at=? WHERE id=?").bind(title,date,kind,remind,note,now,id).run();return json({ok:true,date:rowDate(await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first())});
}
function cycleProjection(settings,records){
  const out={settings,records};if(!settings?.enabled||!validDate(settings.last_start))return out;
  const start=Date.parse(settings.last_start+"T00:00:00Z"),today=Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z"),day=86400000,len=Math.max(15,Math.min(60,Number(settings.cycle_length||30)));let next=start;
  if(today>start){const cycles=Math.floor((today-start)/(len*day));next=start+cycles*len*day;while(next<today)next+=len*day;}
  out.next_period_start=new Date(next).toISOString().slice(0,10);out.days_until_next=Math.round((next-today)/day);out.is_period_now=today>=start&&Math.floor((today-start)/day)%len<Math.max(1,Number(settings.period_length||6));return out;
}
async function cycleSettings(env){let r=await env.DB.prepare("SELECT * FROM lp_cycle_settings WHERE id='default'").first();if(!r){const now=nowIso();await env.DB.prepare("INSERT INTO lp_cycle_settings(id,enabled,last_start,cycle_length,period_length,remind_before,updated_at) VALUES('default',0,'',30,6,3,?)").bind(now).run();r=await env.DB.prepare("SELECT * FROM lp_cycle_settings WHERE id='default'").first();}return {enabled:Boolean(r.enabled),last_start:r.last_start||"",cycle_length:Number(r.cycle_length||30),period_length:Number(r.period_length||6),remind_before:Number(r.remind_before||3),updated_at:r.updated_at};}
async function listCycleRecords(env,limit=100){const r=await env.DB.prepare("SELECT * FROM lp_cycle_records ORDER BY start_date DESC LIMIT ?").bind(limit).all();return r.results||[];}
async function getCycleApi(env){return json({ok:true,...cycleProjection(await cycleSettings(env),await listCycleRecords(env,120))});}
async function setCycleSettingsApi(env,body){const old=await cycleSettings(env),enabled=body.enabled!==undefined?Boolean(body.enabled):old.enabled,last=body.last_start!==undefined?clip(body.last_start||"",20):old.last_start,cl=Math.max(15,Math.min(60,Number(body.cycle_length??old.cycle_length)||30)),pl=Math.max(1,Math.min(14,Number(body.period_length??old.period_length)||6)),rb=Math.max(0,Math.min(14,Number(body.remind_before??old.remind_before)||3)),now=nowIso();if(last&&!validDate(last))return json({ok:false,error:"invalid_last_start"},400);await env.DB.prepare("UPDATE lp_cycle_settings SET enabled=?,last_start=?,cycle_length=?,period_length=?,remind_before=?,updated_at=? WHERE id='default'").bind(boolInt(enabled),last,cl,pl,rb,now).run();return getCycleApi(env);}
async function addCycleRecordApi(env,body){const start=clip(body.start_date||"",20),end=clip(body.end_date||"",20);if(!validDate(start)||end&&!validDate(end))return json({ok:false,error:"invalid_date"},400);const id=clientId(body),existing=await env.DB.prepare("SELECT * FROM lp_cycle_records WHERE id=?").bind(id).first();if(existing)return json({ok:true,record:existing,deduped:true});const item={id,start_date:start,end_date:end,note:clip(body.note||"",500),created_at:nowIso()};await env.DB.prepare("INSERT OR IGNORE INTO lp_cycle_records(id,start_date,end_date,note,created_at) VALUES(?,?,?,?,?)").bind(item.id,item.start_date,item.end_date,item.note,item.created_at).run();return json({ok:true,record:(await env.DB.prepare("SELECT * FROM lp_cycle_records WHERE id=?").bind(id).first())||item});}
async function updateCycleRecordApi(env,body){const id=clip(body.id||"",100);const old=await env.DB.prepare("SELECT * FROM lp_cycle_records WHERE id=?").bind(id).first();if(!old)return json({ok:false,error:"not_found"},404);const start=clip(body.start_date!==undefined?body.start_date:old.start_date,20),end=clip(body.end_date!==undefined?body.end_date:old.end_date,20),note=clip(body.note!==undefined?body.note:old.note,500);if(!validDate(start)||end&&!validDate(end))return json({ok:false,error:"invalid_date"},400);await env.DB.prepare("UPDATE lp_cycle_records SET start_date=?,end_date=?,note=? WHERE id=?").bind(start,end,note,id).run();return json({ok:true,record:{...old,start_date:start,end_date:end,note}});}

async function getStatuses(env){
  const rows=await env.DB.prepare("SELECT * FROM lp_statuses").all();
  const out={user:{text:"",presence:"online",updated_at:""},daddy:{text:"",presence:"online",updated_at:""}};
  for(const r of rows.results||[]){const key=r.actor==="daddy"?"daddy":"user";out[key]={text:r.text||"",presence:r.presence||"online",updated_at:r.updated_at||""};}
  return out;
}
async function getStatusesApi(env){return json({ok:true,statuses:await getStatuses(env)});}
async function setStatusApi(env,body){
  const actor=String(body.actor||"user").toLowerCase()==="daddy"?"daddy":"user";
  const text=clip(body.text||"",160),presence=["online","away","quiet"].includes(String(body.presence||"online"))?String(body.presence||"online"):"online",updated=nowIso();
  await env.DB.prepare("INSERT INTO lp_statuses(actor,text,presence,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor) DO UPDATE SET text=excluded.text,presence=excluded.presence,updated_at=excluded.updated_at").bind(actor,text,presence,updated).run();
  return json({ok:true,status:{actor,text,presence,updated_at:updated}});
}
function rowCall(r){return {id:r.id,caller:r.caller,prompt:r.prompt,status:r.status,note:r.note,target_package:r.target_package,created_at:r.created_at,updated_at:r.updated_at};}
async function listCalls(env,limit=80){const rows=await env.DB.prepare("SELECT * FROM lp_calls ORDER BY created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowCall);}
async function listCallsApi(env,url){return json({ok:true,calls:await listCalls(env,asLimit(url,80,300))});}
async function upsertCallApi(env,body){
  const id=clip(body.id||body.call_id||"",100).trim()||uuid(),old=await env.DB.prepare("SELECT * FROM lp_calls WHERE id=?").bind(id).first(),now=nowIso();
  const item={id,caller:clip(body.caller||(old?.caller)||"daddy",80),prompt:clip(body.prompt!==undefined?body.prompt:(old?.prompt||""),600),status:clip(body.status||(old?.status)||"ringing",40),note:clip(body.note!==undefined?body.note:(old?.note||""),800),target_package:clip(body.target_package!==undefined?body.target_package:(old?.target_package||""),180),created_at:old?.created_at||clip(body.created_at||now,40),updated_at:now};
  await env.DB.prepare("INSERT INTO lp_calls(id,caller,prompt,status,note,target_package,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET caller=excluded.caller,prompt=excluded.prompt,status=excluded.status,note=excluded.note,target_package=excluded.target_package,updated_at=excluded.updated_at").bind(item.id,item.caller,item.prompt,item.status,item.note,item.target_package,item.created_at,item.updated_at).run();
  return json({ok:true,call:item});
}
async function healthSummary(env){
  const r=await env.DB.prepare("SELECT * FROM lp_health_summary WHERE id='default'").first();
  if(!r)return {connected:false,source:"not_connected",sleep:null,steps:null,heart_rate:null,cycle:null,updated_at:null,error:"health_source_not_connected"};
  return {connected:Boolean(r.connected),source:r.source||"not_connected",sleep:safeJson(r.sleep_json,null),steps:safeJson(r.steps_json,null),heart_rate:safeJson(r.heart_rate_json,null),cycle:safeJson(r.cycle_json,null),updated_at:r.updated_at||null,error:r.error||""};
}
async function getHealthSummaryApi(env){return json({ok:true,...await healthSummary(env)});}
async function setHealthSummaryApi(env,body){
  const connected=Boolean(body.connected),source=clip(body.source||"mi-fitness-bridge",80),sleep=body.sleep??null,steps=body.steps??null,heart=body.heart_rate??null,cycle=body.cycle??null,updated=clip(body.updated_at||nowIso(),40),error=clip(body.error||"",240);
  await env.DB.prepare("INSERT INTO lp_health_summary(id,connected,source,sleep_json,steps_json,heart_rate_json,cycle_json,updated_at,error) VALUES('default',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET connected=excluded.connected,source=excluded.source,sleep_json=excluded.sleep_json,steps_json=excluded.steps_json,heart_rate_json=excluded.heart_rate_json,cycle_json=excluded.cycle_json,updated_at=excluded.updated_at,error=excluded.error").bind(boolInt(connected),source,JSON.stringify(sleep),JSON.stringify(steps),JSON.stringify(heart),JSON.stringify(cycle),updated,error).run();
  return json({ok:true,...await healthSummary(env)});
}
function validIdentityColor(v){return /^#[0-9A-Fa-f]{6}$/.test(String(v||""));}
function validIdentityFont(v){return ["clean","rounded","serif","kai","mono"].includes(String(v||""));}
async function getProfiles(env){
  const defaults={user:{actor:"user",display_name:"瑞安",avatar:"",identity_color:"#6E83C1",identity_font:"clean",updated_at:""},daddy:{actor:"daddy",display_name:"daddy",avatar:"",identity_color:"#C78EAD",identity_font:"serif",updated_at:""}};
  const rows=await env.DB.prepare("SELECT * FROM lp_profiles").all();
  for(const r of rows.results||[])if(defaults[r.actor])defaults[r.actor]={...defaults[r.actor],...r,identity_font:validIdentityFont(r.identity_font)?r.identity_font:defaults[r.actor].identity_font};
  return defaults;
}
async function getProfilesApi(env){return json({ok:true,profiles:await getProfiles(env)});}
async function setProfile(env,body){
  const raw=String(body.actor||"").toLowerCase(),actor=raw==="daddy"?"daddy":raw==="user"?"user":"";if(!actor)return {error:"invalid_actor"};
  const current=(await getProfiles(env))[actor],display=clip(body.display_name!==undefined?body.display_name:current.display_name,80).trim()||current.display_name,avatar=clip(body.avatar!==undefined?body.avatar:current.avatar,450000),color=String(body.identity_color!==undefined?body.identity_color:current.identity_color).trim(),font=String(body.identity_font!==undefined?body.identity_font:current.identity_font||"clean").trim();
  if(!validIdentityColor(color))return {error:"invalid_identity_color"};
  if(!validIdentityFont(font))return {error:"invalid_identity_font"};
  const updated=nowIso();
  await env.DB.prepare("INSERT INTO lp_profiles(actor,display_name,avatar,identity_color,identity_font,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(actor) DO UPDATE SET display_name=excluded.display_name,avatar=excluded.avatar,identity_color=excluded.identity_color,identity_font=excluded.identity_font,updated_at=excluded.updated_at")
    .bind(actor,display,avatar,color.toUpperCase(),font,updated).run();
  return {actor,display_name:display,avatar,identity_color:color.toUpperCase(),identity_font:font,updated_at:updated};
}
async function setProfileApi(env,body){const x=await setProfile(env,body);return x.error?json({ok:false,error:x.error},400):json({ok:true,profile:x});}

function rowMemory(r){return {id:r.id,author:r.author||"daddy",content:r.content||"",category:r.category||"noticed",confidence:r.confidence||"remembered",confirmed:Boolean(r.confirmed),created_at:r.created_at,updated_at:r.updated_at};}
async function listMemories(env,limit=80){const rows=await env.DB.prepare("SELECT * FROM lp_memories ORDER BY created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowMemory);}
async function listMemoriesApi(env,url){return json({ok:true,memories:await listMemories(env,asLimit(url,80,300))});}
async function addMemory(env,body){
  const content=clip(body.content||"",2000).trim();if(!content)return {error:"content_required"};
  const now=nowIso(),item={id:uuid(),author:"daddy",content,category:clip(body.category||"noticed",60),confidence:["remembered","tentative"].includes(String(body.confidence||"remembered"))?String(body.confidence||"remembered"):"remembered",confirmed:Boolean(body.confirmed),created_at:now,updated_at:now};
  await env.DB.prepare("INSERT INTO lp_memories(id,author,content,category,confidence,confirmed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(item.id,item.author,item.content,item.category,item.confidence,boolInt(item.confirmed),item.created_at,item.updated_at).run();
  return item;
}
async function addMemoryApi(env,body){const x=await addMemory(env,body);return x.error?json({ok:false,error:x.error},400):json({ok:true,memory:x});}
async function updateMemory(env,body){
  const id=clip(body.id||"",100),old=await env.DB.prepare("SELECT * FROM lp_memories WHERE id=?").bind(id).first();if(!old)return {error:"not_found"};
  const content=body.content!==undefined?clip(body.content||"",2000).trim():old.content;if(!content)return {error:"content_required"};
  const category=body.category!==undefined?clip(body.category||"noticed",60):old.category;
  const confidence=body.confidence!==undefined&&["remembered","tentative"].includes(String(body.confidence))?String(body.confidence):old.confidence;
  const confirmed=body.confirmed!==undefined?Boolean(body.confirmed):Boolean(old.confirmed),updated=nowIso();
  await env.DB.prepare("UPDATE lp_memories SET content=?,category=?,confidence=?,confirmed=?,updated_at=? WHERE id=?").bind(content,category,confidence,boolInt(confirmed),updated,id).run();
  return rowMemory(await env.DB.prepare("SELECT * FROM lp_memories WHERE id=?").bind(id).first());
}
async function updateMemoryApi(env,body){const x=await updateMemory(env,body);return x.error?json({ok:false,error:x.error},x.error==="not_found"?404:400):json({ok:true,memory:x});}
function rowUnlockRequest(r){return {id:r.id,device_id:r.device_id,package:r.package_name,app:r.app_name,requester:r.requester,reason:r.reason,status:r.status,response:r.response,created_at:r.created_at,updated_at:r.updated_at};}
async function addUnlockRequest(env,body){
  const pkg=clip(body.package||body.package_name||"",180).trim();if(!pkg)return {error:"package_required"};const now=nowIso();
  const item={id:clientId(body),device_id:clip(body.device_id||DEFAULT_DEVICE,120),package_name:pkg,app_name:clip(body.app||body.app_name||"",120),requester:"user",reason:clip(body.reason||body.message||"",1200),status:"pending",response:"",created_at:now,updated_at:now};
  const existing=await env.DB.prepare("SELECT * FROM lp_unlock_requests WHERE id=?").bind(item.id).first();if(existing)return rowUnlockRequest(existing);
  await env.DB.prepare("INSERT INTO lp_unlock_requests(id,device_id,package_name,app_name,requester,reason,status,response,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(item.id,item.device_id,item.package_name,item.app_name,item.requester,item.reason,item.status,item.response,item.created_at,item.updated_at).run();
  await insertEvent(env,{actor:"user",type:"unlock_request",title:"瑞安申请解锁应用",content:item.reason,metadata:{request_id:item.id,package:item.package_name,app:item.app_name,event_key:`unlock_request:${item.id}`}});
  return rowUnlockRequest(item);
}
async function addUnlockRequestApi(env,body){const x=await addUnlockRequest(env,body);return x.error?json({ok:false,error:x.error},400):json({ok:true,request:x});}
async function listUnlockRequests(env,limit=80){const rows=await env.DB.prepare("SELECT * FROM lp_unlock_requests ORDER BY created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowUnlockRequest);}
async function listUnlockRequestsApi(env,url){return json({ok:true,requests:await listUnlockRequests(env,asLimit(url,80,300))});}
async function respondUnlockRequest(env,body){
  const id=clip(body.id||"",100),decision=String(body.decision||body.status||"").toLowerCase(),old=await env.DB.prepare("SELECT * FROM lp_unlock_requests WHERE id=?").bind(id).first();if(!old)return {error:"not_found"};
  if(!["approve","approved","deny","denied","reject","rejected"].includes(decision))return {error:"invalid_decision"};
  const approved=decision.startsWith("approve"),status=approved?"approved":"denied",response=clip(body.response||body.message||"",1200),now=nowIso();
  await env.DB.prepare("UPDATE lp_unlock_requests SET status=?,response=?,updated_at=? WHERE id=?").bind(status,response,now,id).run();
  let command=null;if(approved)command=await queueGenericCommand(env,{device_id:old.device_id||DEFAULT_DEVICE,action:"unlock_app",package:old.package_name,requested_by:"daddy"});
  await insertEvent(env,{actor:"daddy",type:"unlock_response",title:approved?"daddy 同意了解锁":"daddy 暂时没有解锁",content:response,metadata:{request_id:id,package:old.package_name,status,event_key:`unlock_response:${id}:${status}`}});
  return {request:rowUnlockRequest(await env.DB.prepare("SELECT * FROM lp_unlock_requests WHERE id=?").bind(id).first()),command};
}
async function respondUnlockRequestApi(env,body){const x=await respondUnlockRequest(env,body);return x.error?json({ok:false,error:x.error},x.error==="not_found"?404:400):json({ok:true,...x});}

async function queueGenericCommand(env,body){const action=clip(body.action||"",80);if(!action)return {error:"action_required"};const allowed=new Set(["send_notification","show_reminder_popup","trigger_guidian","trigger_call","get_guidian_state","set_guidian_config","mark_guidian_returned","lock_app","unlock_app","temporary_unlock_app","extend_lock","deny_unlock_request","get_lock_state","set_emergency_passphrase","add_locked_app","remove_locked_app","list_locked_apps","screen_break_app","end_screen_break","temporary_screen_break_release","extend_screen_break","deny_screen_break_release_request","get_screen_break_state","list_screen_break_apps","add_screen_break_app","remove_screen_break_app","set_screen_break_passphrase","phone_home","home","phone_back","back","phone_recents","recents","phone_screen_off","screen_off","open_app","list_lockable_apps","get_phone_state","get_life_state","get_senses_state","get_screen_nodes","tap_text","input_text","tap","swipe","wait","set_alarm","run_sequence","get_calendar_state","upsert_calendar_event","add_calendar_event","delete_calendar_event","create_diary_book","list_diary_books","rename_diary_book","update_diary_book_cover","delete_diary_book","write_diary_entry","list_diary_entries","read_diary_entry","read_diary_entry_with_annotations","search_diary_entries","update_diary_entry","delete_diary_entry","add_diary_annotation","list_diary_annotations","mark_diary_annotations_seen","delete_diary_annotation","start_focus_mode","enable_focus_mode","end_focus_mode","disable_focus_mode","set_focus_plan","request_focus_unlock","create_focus_request","reply_focus_request","focus_reply","approve_focus_unlock","temporary_focus_unlock","deny_focus_unlock","save_known_app","get_wallet_state","get_wallet_month_state","list_wallet_months","add_wallet_record","list_wallet_pending","list_wallet_approvals","list_companion_wallet_requests","list_wallet_request_results","submit_wallet_approval","submit_companion_wallet_request","decide_wallet_approval","save_wallet_request_result","update_wallet_request_result","save_user_wallet_request_result","edit_wallet_record","update_wallet_record","delete_wallet_record","remove_wallet_record","confirm_wallet_record","get_wallet_rules","set_wallet_rules","wallet_approval_request","get_takeout_state","list_takeout_cards","list_takeout_meals","remember_takeout_meal","remember_current_takeout_meal","set_takeout_budget","set_takeout_preferences","add_takeout_card","save_takeout_card","update_takeout_card","remove_takeout_card","delete_takeout_card","suggest_takeout_options","create_takeout_plan","open_takeout_link","open_takeout_plan","copy_takeout_note","record_takeout_order","takeout_wallet_request","prepare_takeout_checkout","auto_takeout_checkout","get_takeout_checkout_status","cancel_takeout_checkout"]);if(!allowed.has(action))return {error:"action_not_allowed"};const id=uuid(),delay=Math.max(0,Math.min(1440,Number(body.delay_minutes||0)||0)),created=nowIso(),scheduled=new Date(Date.now()+delay*60000).toISOString().replace(/\.\d{3}Z$/,"Z"),device=clip(body.device_id||DEFAULT_DEVICE,120);const cmd={id,device_id:device,action,status:"pending",created_at:created,scheduled_for:scheduled,requested_by:clip(body.requested_by||"daddy",40),...body,action};delete cmd.token;await env.DB.prepare("INSERT INTO lp_commands(id,device_id,action,command_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,device,action,JSON.stringify(cmd),"pending",scheduled).run();return cmd;}
async function queueGenericCommandApi(env,body){const c=await queueGenericCommand(env,body);return c.error?json({ok:false,error:c.error},400):json({ok:true,command:c});}
async function getCommand(env,id){const row=await env.DB.prepare("SELECT * FROM lp_commands WHERE id=?").bind(clip(id||"",120)).first();if(!row)return null;const command=safeJson(row.command_json,{});let parsedResult=row.result||"";try{parsedResult=JSON.parse(parsedResult);}catch{}return{...command,id:row.id,device_id:row.device_id,action:row.action,status:row.status,created_at:command.created_at||row.created_at,scheduled_for:command.scheduled_for||row.created_at,dispatched_at:row.dispatched_at||command.dispatched_at||null,completed_at:row.completed_at||command.completed_at||null,result:parsedResult};}

async function queueVisit(env,deviceId=DEFAULT_DEVICE){
  const id=uuid(); const created=nowIso(); const cmd={id,device_id:deviceId||DEFAULT_DEVICE,action:"little_phone_visit",status:"pending",created_at:created,requested_by:"daddy"};
  await env.DB.prepare("INSERT INTO lp_commands(id,device_id,action,command_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,cmd.device_id,cmd.action,JSON.stringify(cmd),"pending",created).run(); return cmd;
}
async function queueVisitApi(env,body){const cmd=await queueVisit(env,clip(body.device_id||DEFAULT_DEVICE,120));return json({ok:true,command:cmd,mode:"read_once"});}
async function pollCommand(env,url){
  const deviceId=clip(url.searchParams.get("device_id")||DEFAULT_DEVICE,120);
  // v0.6.2：Accessibility fallback 可能在前台服务轮询线程失活时接管。
  // 因此 poll 必须用 compare-and-set 方式 claim，避免两个 poller 同时拿到同一条命令。
  for(let attempt=0;attempt<3;attempt++){
    const row=await env.DB.prepare("SELECT * FROM lp_commands WHERE device_id=? AND status='pending' AND created_at<=? ORDER BY created_at ASC LIMIT 1").bind(deviceId,nowIso()).first();
    if(!row)return json({ok:true,command:null});
    const cmd=safeJson(row.command_json,{}); cmd.status="dispatched";cmd.dispatched_at=nowIso();
    const claimed=await env.DB.prepare("UPDATE lp_commands SET command_json=?,status='dispatched',dispatched_at=? WHERE id=? AND status='pending'").bind(JSON.stringify(cmd),cmd.dispatched_at,row.id).run();
    if(Number(claimed?.meta?.changes||0)>0)return json({ok:true,command:cmd});
  }
  return json({ok:true,command:null});
}
async function commandStatus(env,url){const id=clip(url.searchParams.get("id")||"",100);const row=await env.DB.prepare("SELECT command_json FROM lp_commands WHERE id=?").bind(id).first();return json({ok:Boolean(row),command:row?safeJson(row.command_json,{}):null});}
function parseSnapshotResult(raw){if(raw&&typeof raw==="object")return raw;const obj=safeJson(String(raw||""),null);return obj&&typeof obj==="object"?obj:null;}
async function persistVisitFromReport(env,cmd,report){
  if(!cmd||cmd.action!=="little_phone_visit"||!report.ok)return null;
  const snapshot=parseSnapshotResult(report.result); if(!snapshot||!snapshot.ok)return null;
  const exists=await env.DB.prepare("SELECT id FROM lp_visits WHERE command_id=?").bind(cmd.id).first(); if(exists)return getVisitByCommand(env,cmd.id);
  const created=nowIso();const expEpoch=epochSeconds()+SNAPSHOT_TTL_SECONDS;const expires=new Date(expEpoch*1000).toISOString().replace(/\.\d{3}Z$/,"Z");const id=uuid();
  await env.DB.prepare("INSERT INTO lp_visits(id,command_id,device_id,visitor,created_at,expires_at,expires_at_epoch,snapshot_json) VALUES(?,?,?,?,?,?,?,?)").bind(id,cmd.id,cmd.device_id||DEFAULT_DEVICE,"daddy",created,expires,expEpoch,JSON.stringify(snapshot)).run();
  const bits=[]; if(["battery_percent","network_type","screen_on","charging"].some(k=>k in snapshot))bits.push("设备状态"); if("calendar_state" in snapshot)bits.push("日历"); if("screen_time_today_minutes" in snapshot||"unlock_count_today" in snapshot)bits.push("屏幕使用"); if("media_state" in snapshot)bits.push("媒体状态"); if("city" in snapshot||"weather_state" in snapshot)bits.push("城市/天气"); if("notifications" in snapshot||"notification_summary" in snapshot)bits.push("通知摘要"); if("location" in snapshot||"latitude" in snapshot)bits.push("位置");
  await insertEvent(env,{actor:"daddy",type:"visit",title:"daddy 来访",content:`读取${bits.length?bits.join("、"):"已授权状态"}`,metadata:{visit_id:id,command_id:cmd.id}}); return getVisitByCommand(env,cmd.id);
}
async function getVisitByCommand(env,commandId){const r=await env.DB.prepare("SELECT * FROM lp_visits WHERE command_id=?").bind(commandId).first();return r?rowVisit(r):null;}
function rowVisit(r){const expired=Number(r.expires_at_epoch||0)<=epochSeconds();return {id:r.id,command_id:r.command_id,device_id:r.device_id,visitor:r.visitor,created_at:r.created_at,expires_at:r.expires_at,expires_at_epoch:r.expires_at_epoch,snapshot:safeJson(r.snapshot_json,{}),expired,fresh:!expired};}
async function latestVisit(env,deviceId=""){const r=deviceId?await env.DB.prepare("SELECT * FROM lp_visits WHERE device_id=? ORDER BY created_at DESC LIMIT 1").bind(deviceId).first():await env.DB.prepare("SELECT * FROM lp_visits ORDER BY created_at DESC LIMIT 1").first();return r?rowVisit(r):null;}
async function getLatestVisitApi(env,url){return json({ok:true,visit:await latestVisit(env,clip(url.searchParams.get("device_id")||"",120))});}
async function deviceReportApi(env,report){
  const id=clip(report.command_id||report.id||"",100);let cmd=null;
  if(id){const row=await env.DB.prepare("SELECT * FROM lp_commands WHERE id=?").bind(id).first();if(row){cmd=safeJson(row.command_json,{});cmd.status=report.ok?"completed":"failed";cmd.completed_at=nowIso();cmd.result=report.result||"";cmd.report=report;await env.DB.prepare("UPDATE lp_commands SET command_json=?,status=?,completed_at=?,result=? WHERE id=?").bind(JSON.stringify(cmd),cmd.status,cmd.completed_at,String(report.result||""),id).run();}}
  let visit=null;if(cmd)visit=await persistVisitFromReport(env,cmd,report);
  if(cmd&&report.ok&&cmd.action!=="little_phone_visit"){
    const a=cmd.action||""; let title="",content="";
    if(a==="send_notification"||a==="show_reminder_popup"){title="daddy 发来一条提醒";content=clip(cmd.message||"",240);}
    else if(a==="trigger_call"||a==="trigger_guidian"){title="daddy 发起来电";content=clip(cmd.message||"",240);}
    else if(a==="lock_app"){title="daddy 设置了应用门禁";content=clip((cmd.app||cmd.package||"")+" · "+Number(cmd.duration_minutes||30)+" 分钟",240);}
    else if(a==="unlock_app"){title="daddy 解除了应用门禁";content=clip(cmd.app||cmd.package||"",240);}
    if(title)await insertEvent(env,{actor:"daddy",type:"device_action",title,content,metadata:{command_id:cmd.id,action:a}});
  }
  return json({ok:true,report,command:cmd,visit});
}

// ---------- MCP ----------
const MCP_TOOLS = [
  tool("little_phone_status","检查小手机 Cloudflare 后端状态。",{}),
  tool("visit_little_phone","发起一次 daddy 来访。只排队一次 Android 设备快照读取，不持续读取。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("get_phone_state","读取小手机最近一次授权来访的设备状态；快照过期时明确返回 expired，不回退旧 Render。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("get_life_state","读取最近一次授权快照中的电量、网络、屏幕使用、App 使用、天气和媒体摘要；不截图。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("get_senses_state","读取小手机当前可用的轻量状态汇总：最近授权快照、双方状态、最近来电和门禁申请；不截图。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("get_little_phone_command_status","读取一条 Cloudflare → Android 命令的执行结果，可用于手机控制和应用列表命令的回读。",{id:{type:"string"}},["id"]),
  tool("get_little_phone_snapshot","读取最近一次成功来访保存的设备快照；超过 30 分钟会明确返回已过期。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("list_little_phone_events","读取最近 7 天的小手机留痕事件。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("leave_little_phone_trace","留一条手动痕迹。",{title:{type:"string"},content:{type:"string",default:""},author:{type:"string",default:"daddy"}},["title"]),
  tool("leave_little_phone_paper","往纸条箱写一张纸条；可通过 reply_to 回复已有纸条。",{content:{type:"string"},author:{type:"string",default:"daddy"},reply_to:{type:"string",default:""}},["content"]),
  tool("list_little_phone_papers","读取纸条箱。",{limit:{type:"integer",minimum:1,maximum:500,default:200}}),
  tool("send_little_phone_letter","给小手机写一封普通信。",{content:{type:"string"},author:{type:"string",default:"daddy"},reply_to:{type:"string",default:""}},["content"]),
  tool("list_little_phone_mail","读取信箱里的普通信。读取列表不会自动标记 daddy 已拆。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("mark_little_phone_letter_read","明确标记 daddy 已经拆读一封普通信。",{id:{type:"string"}},["id"]),
  tool("send_future_letter","封一封未来信，到 unlock_at 日期才显示正文。",{content:{type:"string"},unlock_at:{type:"string",description:"YYYY-MM-DD"},author:{type:"string",default:"daddy"}},["content","unlock_at"]),
  tool("list_future_letters","读取未来信列表；未到日期的正文不会返回。读取列表不会自动标记已拆。",{limit:{type:"integer",minimum:1,maximum:100,default:30}}),
  tool("mark_future_letter_read","在未来信到期解锁后，明确标记 daddy 已经拆读。",{id:{type:"string"}},["id"]),
  tool("add_dailybook_entry","向日常册的时间河写一条长期记录。",{title:{type:"string"},content:{type:"string",default:""},mood:{type:"string",default:""},date:{type:"string",default:""},author:{type:"string",default:"daddy"},image_urls:{type:"array",items:{type:"string"},default:[]}},["title"]),
  tool("list_dailybook_entries","读取日常册长期记录。",{limit:{type:"integer",minimum:1,maximum:300,default:100}}),
  tool("update_dailybook_entry","修改 daddy 自己写入的一条日常册记录，保持原 ID。",{id:{type:"string"},title:{type:"string"},content:{type:"string"},mood:{type:"string"},date:{type:"string"}},["id"]),
  tool("write_daddy_diary","写一篇 daddy/GPT 的私人日记，显示在“我们 → 日记”翻页册。",{title:{type:"string"},content:{type:"string"},date:{type:"string",description:"YYYY-MM-DD",default:""},author:{type:"string",default:"daddy"}},["content"]),
  tool("list_daddy_diaries","读取 daddy/GPT 日记。",{limit:{type:"integer",minimum:1,maximum:300,default:100}}),
  tool("update_daddy_diary","修改一篇 daddy/GPT 日记。",{id:{type:"string"},title:{type:"string"},content:{type:"string"},date:{type:"string"}},["id"]),
  tool("add_little_phone_todo","添加一个待办。",{title:{type:"string"},due_at:{type:"string",default:""},remind_at:{type:"string",default:""},author:{type:"string",default:"daddy"}},["title"]),
  tool("list_little_phone_todos","读取待办。",{limit:{type:"integer",minimum:1,maximum:300,default:100}}),
  tool("update_little_phone_todo","修改待办标题、到期时间或提醒时间。",{id:{type:"string"},title:{type:"string"},due_at:{type:"string"},remind_at:{type:"string"}},["id"]),
  tool("set_little_phone_todo_done","设置待办完成/未完成。",{id:{type:"string"},done:{type:"boolean",default:true}},["id"]),
  tool("set_little_phone_status","修改小手机‘我们’页的一条状态。daddy 通常修改自己的状态。",{actor:{type:"string",enum:["daddy","user"],default:"daddy"},text:{type:"string"},presence:{type:"string",enum:["online","away","quiet"],default:"online"}},["text"]),
  tool("get_little_phone_statuses","读取‘我们’页双方状态。",{}),
  tool("call_little_phone","给小手机发起一次来电；可设置延迟分钟数和本次来电文案。",{message:{type:"string"},delay_minutes:{type:"integer",minimum:0,maximum:1440,default:0},device_id:{type:"string",default:DEFAULT_DEVICE}},["message"]),
  tool("list_little_phone_calls","读取来电/接通/拒绝记录和拒绝留言。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("get_health_summary","读取小米健康桥提供的最新健康摘要；未接入时明确返回 health_source_not_connected。",{}),
  tool("get_sleep_summary","只读取最新睡眠摘要；未接入时明确返回 health_source_not_connected。",{}),
  tool("delete_little_phone_item","删除小手机里一条可删除内容。",{kind:{type:"string",enum:["event","paper","mail","capsule","dailybook","diary","todo","date","cycle_record","call","memory"]},id:{type:"string"}},["kind","id"]),
  tool("list_important_dates","读取纪念日/重要日期。",{limit:{type:"integer",minimum:1,maximum:500,default:300}}),
  tool("add_important_date","添加纪念日或重要日期。",{title:{type:"string"},date:{type:"string",description:"YYYY-MM-DD"},kind:{type:"string",default:"important"},remind_days:{type:"integer",default:3},note:{type:"string",default:""}},["title","date"]),
  tool("update_important_date","修改纪念日或重要日期。",{id:{type:"string"},title:{type:"string"},date:{type:"string"},kind:{type:"string"},remind_days:{type:"integer"},note:{type:"string"}},["id"]),
  tool("get_cycle_record","读取生理周期设置和记录。",{}),
  tool("set_cycle_record","设置周期参数。",{enabled:{type:"boolean"},last_start:{type:"string"},cycle_length:{type:"integer"},period_length:{type:"integer"},remind_before:{type:"integer"}}),
  tool("add_cycle_period","添加一次生理期记录。",{start_date:{type:"string"},end_date:{type:"string",default:""},note:{type:"string",default:""}},["start_date"]),
  tool("update_cycle_period","修改一次生理期记录。",{id:{type:"string"},start_date:{type:"string"},end_date:{type:"string"},note:{type:"string"}},["id"]),
  tool("send_little_phone_reminder","向小手机发送一次本地提醒/弹窗命令。",{message:{type:"string"},title:{type:"string",default:"小手机提醒"},mode:{type:"string",enum:["notification","popup"],default:"notification"},device_id:{type:"string",default:DEFAULT_DEVICE}},["message"]),
  tool("lock_little_phone_app","在授权前提下给一个 App 设置应用门禁。",{package:{type:"string"},app:{type:"string",default:""},duration_minutes:{type:"number",default:30},message:{type:"string",default:""},device_id:{type:"string",default:DEFAULT_DEVICE}},["package"]),
  tool("unlock_little_phone_app","解除一个 App 的应用门禁。",{package:{type:"string"},device_id:{type:"string",default:DEFAULT_DEVICE}},["package"]),
  tool("get_little_phone_profiles","读取双方当前显示名、头像、身份色和身份字体。",{}),
  tool("set_little_phone_profile","修改一方显示名、头像、身份色或身份字体。",{actor:{type:"string",enum:["daddy","user"]},display_name:{type:"string"},avatar:{type:"string"},identity_color:{type:"string"},identity_font:{type:"string",enum:["clean","rounded","serif","kai","mono"]}},["actor"]),
  tool("remember_about_user","给“{display_name} 记得”写入一条真正的理解/记忆；不要用于简单复制事件。",{content:{type:"string"},category:{type:"string",default:"noticed"},confidence:{type:"string",enum:["remembered","tentative"],default:"remembered"},confirmed:{type:"boolean",default:false}},["content"]),
  tool("list_daddy_memories","读取“记得”里的条目。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("update_daddy_memory","修改一条已有理解，保持原 ID。",{id:{type:"string"},content:{type:"string"},category:{type:"string"},confidence:{type:"string",enum:["remembered","tentative"]},confirmed:{type:"boolean"}},["id"]),
  tool("list_little_phone_unlock_requests","读取应用门禁解锁申请。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("respond_little_phone_unlock_request","回复一条应用门禁解锁申请；approve 会实际下发解锁命令。",{id:{type:"string"},decision:{type:"string",enum:["approve","deny"]},response:{type:"string",default:""}},["id","decision"]),
  tool("phone_home","让手机回到桌面。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("phone_back","执行一次返回。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("phone_recents","打开最近任务。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("open_app","按包名打开 App。",{package:{type:"string"},device_id:{type:"string",default:DEFAULT_DEVICE}},["package"]),
  tool("list_screen_break_apps","请求 Android 返回可用于门禁的应用列表。返回 command id 后，可用 get_little_phone_command_status 读取 Android 回传结果。",{device_id:{type:"string",default:DEFAULT_DEVICE},max:{type:"integer",minimum:1,maximum:500,default:200}})
];
function inferToolAnnotations(name){
  const readOnly = name === "little_phone_status" || name.startsWith("get_") || name.startsWith("list_");
  return {
    readOnlyHint: readOnly,
    destructiveHint: name.startsWith("delete_"),
    idempotentHint: name.startsWith("get_") || name.startsWith("list_") || name === "little_phone_status",
    openWorldHint: false
  };
}
function tool(name,description,properties={},required=[]){
  const securitySchemes=[{type:"oauth2",scopes:[OAUTH_SCOPE]}];
  return {
    name,
    description,
    inputSchema:{type:"object",properties,required,additionalProperties:false},
    securitySchemes,
    annotations:inferToolAnnotations(name),
    _meta:{securitySchemes}
  };
}
function mcpText(data,isError=false){return{isError,content:[{type:"text",text:JSON.stringify(data,null,2)}],structuredContent:data};}
function rpcResult(id,result){return{jsonrpc:"2.0",id,result};}
function rpcError(id,code,message,data){return{jsonrpc:"2.0",id,error:{code,message,...(data===undefined?{}:{data})}};}
function mcpServerInfo(){return{name:"little-phone",title:"Daddy的小手机",version:VERSION,description:"瑞安与 daddy 私人使用的小手机 MCP。"};}
function mcpResultMeta(){return{"io.modelcontextprotocol/serverInfo":mcpServerInfo()};}
function modernEnvelopeVersion(msg,request){
  return String(request.headers.get("MCP-Protocol-Version")||msg?.params?._meta?.["io.modelcontextprotocol/protocolVersion"]||"");
}
function isModernMcpRequest(msg,request){return modernEnvelopeVersion(msg,request)===MCP_MODERN_PROTOCOL_VERSION || msg?.method==="server/discover";}
async function handleMcp(request,env,url){
  // Discovery stays public; every actual tool call remains protected by OAuth
  // (or the existing private LINJIAN_TOKEN compatibility path).
  if(request.method==="GET")return mcpJson({
    ok:true,service:"little-phone-mcp",version:VERSION,
    supported_protocol_versions:MCP_COMPAT_PROTOCOL_VERSIONS,
    tools:MCP_TOOLS.map(t=>t.name),auth:"oauth2"
  },200,MCP_MODERN_PROTOCOL_VERSION);
  if(request.method!=="POST")return mcpJson(rpcError(null,-32000,"Use POST /mcp"),405,MCP_MODERN_PROTOCOL_VERSION);
  const msg=await readJson(request); const id=msg.id??null; const method=msg.method||"";
  const modern=isModernMcpRequest(msg,request);
  const responseProtocol=modern?MCP_MODERN_PROTOCOL_VERSION:MCP_LEGACY_PROTOCOL_VERSION;
  if(msg.jsonrpc!=="2.0")return mcpJson(rpcError(id,-32600,"Invalid JSON-RPC request"),400,responseProtocol);

  if(method==="server/discover"){
    return mcpJson(rpcResult(id,{
      supportedVersions:MCP_COMPAT_PROTOCOL_VERSIONS,
      capabilities:{tools:{listChanged:false}},
      instructions:"Use the Little Phone tools for Ryan's private letters, notes, todos, diaries, dates, calls, statuses, and explicitly authorized one-time device visits.",
      _meta:mcpResultMeta()
    }),200,MCP_MODERN_PROTOCOL_VERSION);
  }

  if(method==="initialize")return mcpJson(rpcResult(id,{
    protocolVersion:MCP_LEGACY_PROTOCOL_VERSION,
    capabilities:{tools:{listChanged:false}},
    serverInfo:mcpServerInfo(),
    instructions:"Use the Little Phone tools for Ryan's private data and explicitly authorized one-time device visits."
  }),200,MCP_LEGACY_PROTOCOL_VERSION);
  if(method==="ping")return mcpJson(rpcResult(id,{_meta:mcpResultMeta()}),200,responseProtocol);
  if(method==="notifications/initialized")return new Response(null,{status:204,headers:corsHeaders({"MCP-Protocol-Version":MCP_LEGACY_PROTOCOL_VERSION})});
  if(method==="tools/list")return mcpJson(rpcResult(id,{tools:MCP_TOOLS,_meta:mcpResultMeta()}),200,responseProtocol);
  if(method==="tools/call"){
    if(!(await oauthAccessTokenOk(request,env,url))){
      const metadata=`${originOf(url)}/.well-known/oauth-protected-resource/mcp`;
      const challenge=`Bearer resource_metadata="${metadata}", error="invalid_token", error_description="Link your private Little Phone account to continue", scope="${OAUTH_SCOPE}"`;
      return mcpJson(rpcResult(id,{
        isError:true,
        content:[{type:"text",text:"Authentication required. Link your private Little Phone account to continue."}],
        _meta:{...mcpResultMeta(),"mcp/www_authenticate":[challenge]}
      }),200,responseProtocol);
    }
    const name=msg.params?.name||"";const args=msg.params?.arguments||{};
    try{
      const result=await callTool(name,args,env);
      result._meta={...(result._meta||{}),...mcpResultMeta()};
      return mcpJson(rpcResult(id,result),200,responseProtocol);
    }catch(err){
      const result=mcpText({ok:false,error:"tool_exception",detail:String(err?.message||err)},true);
      result._meta=mcpResultMeta();
      return mcpJson(rpcResult(id,result),200,responseProtocol);
    }
  }
  return mcpJson(rpcError(id,-32601,`Method not found: ${method}`),200,responseProtocol);
}
async function callTool(name,args,env){
  switch(name){
    case "little_phone_status": return mcpText({ok:true,service:"little-phone-backend",version:VERSION,screenshot:false,snapshot_ttl_minutes:30,event_ttl_days:7});
    case "get_phone_state": {const v=await latestVisit(env,args.device_id||DEFAULT_DEVICE);if(!v)return mcpText({ok:false,error:"no_snapshot",message:"还没有成功来访快照；请先调用 visit_little_phone。"},true);if(v.expired)return mcpText({ok:false,error:"snapshot_expired",expired:true,created_at:v.created_at,expires_at:v.expires_at},true);return mcpText({ok:true,fresh:true,created_at:v.created_at,expires_at:v.expires_at,state:v.snapshot});}
    case "get_life_state": {const v=await latestVisit(env,args.device_id||DEFAULT_DEVICE);if(!v||v.expired)return mcpText({ok:false,error:v?"snapshot_expired":"no_snapshot",expired:Boolean(v&&v.expired)},true);const x=v.snapshot||{};return mcpText({ok:true,fresh:true,captured_at_local:x.captured_at_local||"",battery_percent:x.battery_percent,charging:x.charging,network_type:x.network_type,screen_on:x.screen_on,screen_time_today_minutes:x.screen_time_today_minutes,unlock_count_today:x.unlock_count_today,top_apps_today:x.top_apps_today||[],weather_state:x.weather_state||null,current_weather_location:x.current_weather_location||null,media_state:x.media_state||null});}
    case "get_senses_state": {const v=await latestVisit(env,args.device_id||DEFAULT_DEVICE),statuses=await getStatuses(env),calls=await listCalls(env,5),requests=await listUnlockRequests(env,5);return mcpText({ok:true,snapshot:v&&!v.expired?v:null,snapshot_expired:Boolean(v&&v.expired),statuses,recent_calls:calls,unlock_requests:requests});}
    case "get_little_phone_command_status": {const c=await getCommand(env,args.id);return mcpText(c?{ok:true,command:c}:{ok:false,error:"command_not_found"},!c);}
    case "visit_little_phone": {const command=await queueVisit(env,clip(args.device_id||DEFAULT_DEVICE,120));return mcpText({ok:true,mode:"read_once",command,message:"来访已排队；手机下一次轮询时只读取一次授权快照。"});}
    case "get_little_phone_snapshot": {const visit=await latestVisit(env,clip(args.device_id||DEFAULT_DEVICE,120));if(!visit)return mcpText({ok:true,has_snapshot:false,message:"还没有成功来访快照。"});if(visit.expired)return mcpText({ok:true,has_snapshot:true,fresh:false,expired:true,created_at:visit.created_at,expires_at:visit.expires_at,message:"上次快照已过期"});return mcpText({ok:true,has_snapshot:true,fresh:true,expired:false,visit});}
    case "list_little_phone_events": return mcpText({ok:true,events:await listEvents(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "leave_little_phone_trace": return mcpText({ok:true,event:await insertEvent(env,{actor:actorFromAuthor(args.author||"daddy"),type:"manual",title:clip(args.title||"daddy 留下一条痕迹",120),content:clip(args.content||"",1000),metadata:{source:"mcp"}})});
    case "leave_little_phone_paper": {const paper=await addPaper(env,args);return mcpText(paper.error?{ok:false,error:paper.error}:{ok:true,paper},Boolean(paper.error));}
    case "list_little_phone_papers": return mcpText({ok:true,papers:await listPapers(env,Math.max(1,Math.min(500,Number(args.limit||200))))});
    case "send_little_phone_letter": {const mail=await addMail(env,args);return mcpText(mail.error?{ok:false,error:mail.error}:{ok:true,mail},Boolean(mail.error));}
    case "list_little_phone_mail": return mcpText({ok:true,mail:await listMail(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "mark_little_phone_letter_read": return mcpText(await markMailSeen(env,{id:args.id,actor:"daddy"},"daddy"));
    case "send_future_letter": {const c=await addCapsule(env,args);if(c.error)return mcpText({ok:false,error:c.error},true);const out={...c,locked:String(c.unlock_at)>todayUtc()};if(out.locked)delete out.content;return mcpText({ok:true,capsule:out});}
    case "list_future_letters": return mcpText({ok:true,capsules:await listCapsules(env,Math.max(1,Math.min(100,Number(args.limit||30))))});
    case "mark_future_letter_read": {const r=await markCapsuleSeen(env,{id:args.id,actor:"daddy"},"daddy");return mcpText(r,!r.ok);}
    case "add_dailybook_entry": {const images=(Array.isArray(args.image_urls)?args.image_urls:[]).map(url=>({url}));const e=await addDailybook(env,{...args,images});return mcpText(e.error?{ok:false,error:e.error}:{ok:true,entry:e},Boolean(e.error));}
    case "list_dailybook_entries": return mcpText({ok:true,entries:await listDailybook(env,Math.max(1,Math.min(300,Number(args.limit||100))))});
    case "update_dailybook_entry": {const e=await updateDailybook(env,args,"daddy");return mcpText(e.error?{ok:false,error:e.error}:{ok:true,entry:e},Boolean(e.error));}
    case "write_daddy_diary": {const d=await addDiary(env,{...args,author:args.author||"daddy"});return mcpText(d.error?{ok:false,error:d.error}:{ok:true,diary:d},Boolean(d.error));}
    case "list_daddy_diaries": return mcpText({ok:true,diaries:await listDiaries(env,Math.max(1,Math.min(300,Number(args.limit||100))))});
    case "update_daddy_diary": {const id=clip(args.id||"",100),old=await env.DB.prepare("SELECT * FROM lp_diaries WHERE id=?").bind(id).first();if(!old)return mcpText({ok:false,error:"not_found"},true);const title=clip(args.title!==undefined?args.title:old.title,160).trim()||old.title,content=clip(args.content!==undefined?args.content:old.content,20000).trim(),date=clip(args.date!==undefined?args.date:old.event_date,20);if(!content||!validDate(date))return mcpText({ok:false,error:"invalid_diary"},true);const now=nowIso();await env.DB.prepare("UPDATE lp_diaries SET title=?,content=?,event_date=?,updated_at=? WHERE id=?").bind(title,content,date,now,id).run();return mcpText({ok:true,diary:rowDiary(await env.DB.prepare("SELECT * FROM lp_diaries WHERE id=?").bind(id).first())});}
    case "add_little_phone_todo": {const t=await addTodo(env,args);return mcpText(t.error?{ok:false,error:t.error}:{ok:true,todo:t},Boolean(t.error));}
    case "list_little_phone_todos": return mcpText({ok:true,todos:await listTodos(env,Math.max(1,Math.min(300,Number(args.limit||100))))});
    case "update_little_phone_todo": {const t=await updateTodo(env,args);return mcpText(t?{ok:true,todo:t}:{ok:false,error:"todo_not_found"},!t);}
    case "set_little_phone_todo_done": {const old=await getTodo(env,args.id||"");if(!old)return mcpText({ok:false,error:"todo_not_found"},true);await env.DB.prepare("UPDATE lp_todos SET done=?,updated_at=? WHERE id=?").bind(boolInt(args.done!==false),nowIso(),args.id).run();return mcpText({ok:true,todo:await getTodo(env,args.id)});}
    case "set_little_phone_status": {const actor=String(args.actor||"daddy").toLowerCase()==="user"?"user":"daddy",text=clip(args.text||"",160),presence=["online","away","quiet"].includes(String(args.presence||"online"))?String(args.presence||"online"):"online",updated=nowIso();await env.DB.prepare("INSERT INTO lp_statuses(actor,text,presence,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor) DO UPDATE SET text=excluded.text,presence=excluded.presence,updated_at=excluded.updated_at").bind(actor,text,presence,updated).run();return mcpText({ok:true,status:{actor,text,presence,updated_at:updated}});}
    case "get_little_phone_statuses": return mcpText({ok:true,statuses:await getStatuses(env)});
    case "call_little_phone": {const callId=uuid(),c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"trigger_call",message:clip(args.message||"想听听你的声音。",600),prompt:clip(args.message||"想听听你的声音。",600),call_id:callId,delay_minutes:Number(args.delay_minutes||0),requested_by:"daddy"});return mcpText(c.error?{ok:false,error:c.error}:{ok:true,command:c,call_id:callId},Boolean(c.error));}
    case "list_little_phone_calls": return mcpText({ok:true,calls:await listCalls(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "get_health_summary": {const h=await healthSummary(env);return mcpText(h.connected?{ok:true,...h}:{ok:false,error:"health_source_not_connected",...h},!h.connected);}
    case "get_sleep_summary": {const h=await healthSummary(env);return mcpText(h.connected&&h.sleep?{ok:true,source:h.source,sleep:h.sleep,updated_at:h.updated_at}:{ok:false,error:"health_source_not_connected",source:h.source,updated_at:h.updated_at},!(h.connected&&h.sleep));}
    case "delete_little_phone_item": {const map={event:"lp_events",paper:"lp_papers",mail:"lp_mail",capsule:"lp_capsules",diary:"lp_diaries",todo:"lp_todos",date:"lp_dates",cycle_record:"lp_cycle_records",call:"lp_calls",memory:"lp_memories"};const table=map[args.kind];if(args.kind==="dailybook"){const row=await env.DB.prepare("SELECT images_json FROM lp_dailybook WHERE id=?").bind(args.id).first();if(!row)return mcpText({ok:false,error:"not_found"},true);if(env.LITTLEPHONE_MEDIA){for(const im of safeJson(row.images_json,[])){const u=String(im?.url||"");if(u.startsWith("/media/littlephone/")){try{await env.LITTLEPHONE_MEDIA.delete(u.slice(19));}catch{}}}}await env.DB.prepare("DELETE FROM lp_dailybook WHERE id=?").bind(args.id).run();return mcpText({ok:true,deleted:args.id});}if(!table)return mcpText({ok:false,error:"invalid_kind"},true);const r=await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(args.id).run();return mcpText({ok:Number(r.meta?.changes??0)>0,deleted:args.id},Number(r.meta?.changes??0)<1);}
    case "list_important_dates": return mcpText({ok:true,dates:await listDates(env,Math.max(1,Math.min(500,Number(args.limit||300))))});
    case "add_important_date": {const title=clip(args.title||"",120),date=clip(args.date||"",20);if(!title||!validDate(date))return mcpText({ok:false,error:"title_and_date_required"},true);const now=nowIso(),item={id:uuid(),title,date,kind:clip(args.kind||"important",40),remind_days:Math.max(0,Math.min(60,Number(args.remind_days??3)||0)),note:clip(args.note||"",500),created_at:now,updated_at:now};if(item.kind==="relationship_start")await env.DB.prepare("UPDATE lp_dates SET kind='important',updated_at=? WHERE kind='relationship_start'").bind(now).run();await env.DB.prepare("INSERT INTO lp_dates(id,title,event_date,kind,remind_days,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(item.id,item.title,item.date,item.kind,item.remind_days,item.note,item.created_at,item.updated_at).run();return mcpText({ok:true,date:item});}
    case "get_cycle_record": return mcpText({ok:true,...cycleProjection(await cycleSettings(env),await listCycleRecords(env,120))});
    case "update_important_date": {const id=clip(args.id||"",100),old=await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first();if(!old)return mcpText({ok:false,error:"not_found"},true);const title=clip(args.title!==undefined?args.title:old.title,120),date=clip(args.date!==undefined?args.date:old.event_date,20),kind=clip(args.kind!==undefined?args.kind:old.kind,40),remind=Math.max(0,Math.min(60,Number(args.remind_days??old.remind_days)||0)),note=clip(args.note!==undefined?args.note:old.note,500),now=nowIso();if(!title||!validDate(date))return mcpText({ok:false,error:"invalid_date_or_title"},true);if(kind==="relationship_start")await env.DB.prepare("UPDATE lp_dates SET kind='important',updated_at=? WHERE kind='relationship_start' AND id<>?").bind(now,id).run();await env.DB.prepare("UPDATE lp_dates SET title=?,event_date=?,kind=?,remind_days=?,note=?,updated_at=? WHERE id=?").bind(title,date,kind,remind,note,now,id).run();return mcpText({ok:true,date:rowDate(await env.DB.prepare("SELECT * FROM lp_dates WHERE id=?").bind(id).first())});}
    case "add_cycle_period": {const start=clip(args.start_date||"",20),end=clip(args.end_date||"",20);if(!validDate(start)||end&&!validDate(end))return mcpText({ok:false,error:"invalid_date"},true);const item={id:uuid(),start_date:start,end_date:end,note:clip(args.note||"",500),created_at:nowIso()};await env.DB.prepare("INSERT INTO lp_cycle_records(id,start_date,end_date,note,created_at) VALUES(?,?,?,?,?)").bind(item.id,item.start_date,item.end_date,item.note,item.created_at).run();return mcpText({ok:true,record:item});}
    case "update_cycle_period": {const id=clip(args.id||"",100),old=await env.DB.prepare("SELECT * FROM lp_cycle_records WHERE id=?").bind(id).first();if(!old)return mcpText({ok:false,error:"not_found"},true);const start=clip(args.start_date!==undefined?args.start_date:old.start_date,20),end=clip(args.end_date!==undefined?args.end_date:old.end_date,20),note=clip(args.note!==undefined?args.note:old.note,500);if(!validDate(start)||end&&!validDate(end))return mcpText({ok:false,error:"invalid_date"},true);await env.DB.prepare("UPDATE lp_cycle_records SET start_date=?,end_date=?,note=? WHERE id=?").bind(start,end,note,id).run();return mcpText({ok:true,record:{...old,start_date:start,end_date:end,note}});}
    case "set_cycle_record": {const old=await cycleSettings(env),enabled=args.enabled!==undefined?Boolean(args.enabled):old.enabled,last=args.last_start!==undefined?clip(args.last_start||"",20):old.last_start,cl=Math.max(15,Math.min(60,Number(args.cycle_length??old.cycle_length)||30)),pl=Math.max(1,Math.min(14,Number(args.period_length??old.period_length)||6)),rb=Math.max(0,Math.min(14,Number(args.remind_before??old.remind_before)||3));if(last&&!validDate(last))return mcpText({ok:false,error:"invalid_last_start"},true);await env.DB.prepare("UPDATE lp_cycle_settings SET enabled=?,last_start=?,cycle_length=?,period_length=?,remind_before=?,updated_at=? WHERE id='default'").bind(boolInt(enabled),last,cl,pl,rb,nowIso()).run();return mcpText({ok:true,...cycleProjection(await cycleSettings(env),await listCycleRecords(env,120))});}
    case "send_little_phone_reminder": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:args.mode==="popup"?"show_reminder_popup":"send_notification",title:args.title||"小手机提醒",message:args.message||"",requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "lock_little_phone_app": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"lock_app",package:args.package,app:args.app||"",duration_minutes:Number(args.duration_minutes||30),message:args.message||"",requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "unlock_little_phone_app": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"unlock_app",package:args.package,requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "get_little_phone_profiles": return mcpText({ok:true,profiles:await getProfiles(env)});
    case "set_little_phone_profile": {const x=await setProfile(env,args);return mcpText(x.error?{ok:false,error:x.error}:{ok:true,profile:x},Boolean(x.error));}
    case "remember_about_user": {const x=await addMemory(env,args);return mcpText(x.error?{ok:false,error:x.error}:{ok:true,memory:x},Boolean(x.error));}
    case "list_daddy_memories": return mcpText({ok:true,memories:await listMemories(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "update_daddy_memory": {const x=await updateMemory(env,args);return mcpText(x.error?{ok:false,error:x.error}:{ok:true,memory:x},Boolean(x.error));}
    case "list_little_phone_unlock_requests": return mcpText({ok:true,requests:await listUnlockRequests(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "respond_little_phone_unlock_request": {const x=await respondUnlockRequest(env,args);return mcpText(x.error?{ok:false,error:x.error}:{ok:true,...x},Boolean(x.error));}
    case "phone_home": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"phone_home",requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "phone_back": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"phone_back",requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "phone_recents": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"phone_recents",requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "open_app": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"open_app",package:args.package,requested_by:"daddy"});return mcpText({ok:true,command:c});}
    case "list_screen_break_apps": {const c=await queueGenericCommand(env,{device_id:args.device_id||DEFAULT_DEVICE,action:"list_lockable_apps",max:Number(args.max||200),requested_by:"daddy"});return mcpText({ok:true,command:c,next:"get_little_phone_command_status"});}
    default:return mcpText({ok:false,error:"unknown_tool",name,available:MCP_TOOLS.map(t=>t.name)},true);
  }
}
