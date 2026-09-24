const VERSION = "0.5.1-little-phone";
const DEFAULT_DEVICE = "android-phone";
const MCP_PROTOCOL_VERSION = "2025-06-18";
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
    if (path === "/api/littlephone/visit/latest") return getLatestVisitApi(env, url);
    if (path === "/api/littlephone/events") return listEventsApi(env, url);
    if (path === "/api/littlephone/papers") return listPapersApi(env, url);
    if (path === "/api/littlephone/dailybook") return listDailybookApi(env, url);
    if (path === "/api/littlephone/todos") return listTodosApi(env, url);
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
    if (path === "/api/littlephone/todos") return addTodoApi(env, await readJson(request));
    if (path === "/api/littlephone/todos/toggle") return toggleTodoApi(env, await readJson(request));
    if (path === "/api/littlephone/todos/update") return updateTodoApi(env, await readJson(request));
    if (path === "/api/mail") return addMailApi(env, await readJson(request));
    if (path === "/api/mail/seen") return markMailSeenApi(env, await readJson(request));
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
    "Access-Control-Expose-Headers": "MCP-Protocol-Version",
    ...extra
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  });
}

function tokenOk(request, env, url) {
  const expected = String(env.LINJIAN_TOKEN || "");
  if (!expected) return false;
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const supplied = request.headers.get("X-Auth-Token") || request.headers.get("X-Linjian-Token") || bearer || url.searchParams.get("token") || "";
  return supplied === expected;
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
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_papers_created ON lp_papers(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_mail (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'letter', reply_to TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_mail_created ON lp_mail(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_capsules (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL,
        created_at TEXT NOT NULL, unlock_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_capsules_created ON lp_capsules(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_dailybook (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, title TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL, created_at TEXT NOT NULL,
        images_json TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_dailybook_date ON lp_dailybook(event_date DESC,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS lp_todos (
        id TEXT PRIMARY KEY, author TEXT NOT NULL, title TEXT NOT NULL,
        due_at TEXT NOT NULL DEFAULT '', remind_at TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lp_todos_created ON lp_todos(created_at DESC)`
    ];
    schemaReady = Promise.all(ddl.map(sql => env.DB.prepare(sql).run())).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

async function pruneEvents(env) {
  await env.DB.prepare("DELETE FROM lp_events WHERE expires_at_epoch<=?").bind(epochSeconds()).run();
}

async function insertEvent(env, { actor = "user", type = "event", title = "", content = "", metadata = {} } = {}) {
  await pruneEvents(env);
  const createdAt = nowIso();
  const expiresEpoch = epochSeconds() + EVENT_TTL_SECONDS;
  const expiresAt = new Date(expiresEpoch * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const item = {
    id: uuid(), actor: actor === "daddy" ? "daddy" : "user",
    type: clip(type, 40), title: clip(title, 120), content: clip(content, 1000),
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
  const item = { id:uuid(), author:clip(body.author || "用户",40), content, created_at:nowIso() };
  await env.DB.prepare("INSERT INTO lp_papers(id,author,content,created_at) VALUES(?,?,?,?)").bind(item.id,item.author,item.content,item.created_at).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"paper",title:`${item.author} 留下一张纸条`,content:item.content,metadata:{paper_id:item.id}});
  return item;
}
async function addPaperApi(env, body) { const item=await addPaper(env,body); return item.error?json({ok:false,error:item.error},400):json({ok:true,paper:item}); }
async function listPapers(env, limit=200) { const rows=await env.DB.prepare("SELECT * FROM lp_papers ORDER BY created_at DESC LIMIT ?").bind(limit).all(); return rows.results||[]; }
async function listPapersApi(env,url){ return json({ok:true,papers:await listPapers(env,asLimit(url,200,500))}); }

async function addMail(env, body) {
  const content=clip(body.content||"",6000).trim();
  if(!content) return {error:"content_required"};
  const item={id:uuid(),author:clip(body.author||"用户",40),content,kind:"letter",reply_to:clip(body.reply_to||"",80),created_at:nowIso(),seen:false};
  await env.DB.prepare("INSERT INTO lp_mail(id,author,content,kind,reply_to,created_at,seen) VALUES(?,?,?,?,?,?,0)").bind(item.id,item.author,item.content,item.kind,item.reply_to,item.created_at).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"mail",title:`${item.author} 投递了一封信`,content:item.content.slice(0,240),metadata:{mail_id:item.id}});
  return item;
}
async function addMailApi(env,body){ const item=await addMail(env,body); return item.error?json({ok:false,error:item.error},400):json({ok:true,mail:item}); }
async function listMail(env,limit=80){ const rows=await env.DB.prepare("SELECT * FROM lp_mail ORDER BY created_at DESC LIMIT ?").bind(limit).all(); return (rows.results||[]).map(r=>({...r,seen:Boolean(r.seen)})); }
async function listMailApi(env,url){ return json({ok:true,mail:await listMail(env,asLimit(url,80,300))}); }
async function markMailSeenApi(env,body){
  const id=clip(body.id||"",100); let res;
  if(id) res=await env.DB.prepare("UPDATE lp_mail SET seen=1 WHERE id=? AND seen=0").bind(id).run();
  else res=await env.DB.prepare("UPDATE lp_mail SET seen=1 WHERE seen=0").run();
  const changed=Number(res.meta?.changes ?? res.changes ?? 0);
  if(changed>0) await insertEvent(env,{actor:"user",type:"mail_open",title:"瑞安看了一封信",content:"",metadata:{mail_id:id}});
  return json({ok:true,marked:changed});
}

function todayUtc(){ return new Date().toISOString().slice(0,10); }
async function addCapsule(env,body){
  const content=clip(body.content||"",8000).trim(); if(!content)return {error:"content_required"};
  let unlock=clip(body.unlock_at||"",32); if(!/^\d{4}-\d{2}-\d{2}$/.test(unlock)){const d=new Date(Date.now()+86400000);unlock=d.toISOString().slice(0,10)}
  const item={id:uuid(),author:clip(body.author||"用户",40),content,created_at:nowIso(),unlock_at:unlock};
  await env.DB.prepare("INSERT INTO lp_capsules(id,author,content,created_at,unlock_at) VALUES(?,?,?,?,?)").bind(item.id,item.author,item.content,item.created_at,item.unlock_at).run();
  await insertEvent(env,{actor:actorFromAuthor(item.author),type:"capsule",title:`${item.author} 放入一封未来信`,content:"",metadata:{capsule_id:item.id,unlock_at:item.unlock_at}});
  return item;
}
async function addCapsuleApi(env,body){const item=await addCapsule(env,body);if(item.error)return json({ok:false,error:item.error},400);const out={...item,locked:true};delete out.content;return json({ok:true,capsule:out});}
async function listCapsules(env,limit=30){
  const rows=await env.DB.prepare("SELECT * FROM lp_capsules ORDER BY created_at DESC LIMIT ?").bind(limit).all(); const today=todayUtc();
  return (rows.results||[]).map(r=>{const locked=String(r.unlock_at||"9999-12-31")>today;const item={...r,locked};if(locked)delete item.content;return item;});
}
async function listCapsulesApi(env,url){return json({ok:true,capsules:await listCapsules(env,asLimit(url,30,100))});}

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
    if(!env.LITTLEPHONE_MEDIA){warnings.push(`image_${i+1}_skipped_no_r2`);continue;}
    const bytes=base64ToBytes(parts.base64);
    if(bytes.byteLength>6*1024*1024){warnings.push(`image_${i+1}_too_large`);continue;}
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
async function listDailybook(env,limit=100){const rows=await env.DB.prepare("SELECT * FROM lp_dailybook ORDER BY event_date DESC,created_at DESC LIMIT ?").bind(limit).all();return (rows.results||[]).map(rowDaily);}
async function listDailybookApi(env,url){return json({ok:true,entries:await listDailybook(env,asLimit(url,100,300))});}

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

async function queueVisit(env,deviceId=DEFAULT_DEVICE){
  const id=uuid(); const created=nowIso(); const cmd={id,device_id:deviceId||DEFAULT_DEVICE,action:"little_phone_visit",status:"pending",created_at:created,requested_by:"daddy"};
  await env.DB.prepare("INSERT INTO lp_commands(id,device_id,action,command_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,cmd.device_id,cmd.action,JSON.stringify(cmd),"pending",created).run(); return cmd;
}
async function queueVisitApi(env,body){const cmd=await queueVisit(env,clip(body.device_id||DEFAULT_DEVICE,120));return json({ok:true,command:cmd,mode:"read_once"});}
async function pollCommand(env,url){
  const deviceId=clip(url.searchParams.get("device_id")||DEFAULT_DEVICE,120); const row=await env.DB.prepare("SELECT * FROM lp_commands WHERE device_id=? AND status='pending' ORDER BY created_at ASC LIMIT 1").bind(deviceId).first();
  if(!row)return json({ok:true,command:null}); const cmd=safeJson(row.command_json,{}); cmd.status="dispatched";cmd.dispatched_at=nowIso();
  await env.DB.prepare("UPDATE lp_commands SET command_json=?,status='dispatched',dispatched_at=? WHERE id=?").bind(JSON.stringify(cmd),cmd.dispatched_at,row.id).run(); return json({ok:true,command:cmd});
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
  let visit=null;if(cmd)visit=await persistVisitFromReport(env,cmd,report);return json({ok:true,report,command:cmd,visit});
}

// ---------- MCP ----------
const MCP_TOOLS = [
  tool("little_phone_status","检查小手机 Cloudflare 后端状态。",{}),
  tool("visit_little_phone","发起一次 daddy 来访。只排队一次 Android 设备快照读取，不持续读取。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("get_little_phone_snapshot","读取最近一次成功来访保存的设备快照；超过 30 分钟会明确返回已过期。",{device_id:{type:"string",default:DEFAULT_DEVICE}}),
  tool("list_little_phone_events","读取最近 7 天的小手机留痕事件。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("leave_little_phone_trace","留一条手动痕迹。",{title:{type:"string"},content:{type:"string",default:""},author:{type:"string",default:"daddy"}},["title"]),
  tool("leave_little_phone_paper","往纸条箱写一张纸条。",{content:{type:"string"},author:{type:"string",default:"daddy"}},["content"]),
  tool("list_little_phone_papers","读取纸条箱。",{limit:{type:"integer",minimum:1,maximum:500,default:200}}),
  tool("send_little_phone_letter","给小手机写一封普通信。",{content:{type:"string"},author:{type:"string",default:"daddy"},reply_to:{type:"string",default:""}},["content"]),
  tool("list_little_phone_mail","读取信箱里的普通信。",{limit:{type:"integer",minimum:1,maximum:300,default:80}}),
  tool("send_future_letter","封一封未来信，到 unlock_at 日期才显示正文。",{content:{type:"string"},unlock_at:{type:"string",description:"YYYY-MM-DD"},author:{type:"string",default:"daddy"}},["content","unlock_at"]),
  tool("list_future_letters","读取未来信列表；未到日期的正文不会返回。",{limit:{type:"integer",minimum:1,maximum:100,default:30}}),
  tool("add_dailybook_entry","向日常册的时间河写一条长期记录。",{title:{type:"string"},content:{type:"string",default:""},mood:{type:"string",default:""},date:{type:"string",default:""},author:{type:"string",default:"daddy"},image_urls:{type:"array",items:{type:"string"},default:[]}},["title"]),
  tool("list_dailybook_entries","读取日常册长期记录。",{limit:{type:"integer",minimum:1,maximum:300,default:100}}),
  tool("add_little_phone_todo","添加一个待办。",{title:{type:"string"},due_at:{type:"string",default:""},remind_at:{type:"string",default:""},author:{type:"string",default:"daddy"}},["title"]),
  tool("list_little_phone_todos","读取待办。",{limit:{type:"integer",minimum:1,maximum:300,default:100}}),
  tool("update_little_phone_todo","修改待办标题、到期时间或提醒时间。",{id:{type:"string"},title:{type:"string"},due_at:{type:"string"},remind_at:{type:"string"}},["id"]),
  tool("set_little_phone_todo_done","设置待办完成/未完成。",{id:{type:"string"},done:{type:"boolean",default:true}},["id"])
];
function tool(name,description,properties={},required=[]){return{name,description,inputSchema:{type:"object",properties,required,additionalProperties:false}};}
function mcpText(data,isError=false){return{isError,content:[{type:"text",text:JSON.stringify(data,null,2)}],structuredContent:data};}
function rpcResult(id,result){return{jsonrpc:"2.0",id,result};}
function rpcError(id,code,message){return{jsonrpc:"2.0",id,error:{code,message}};}
async function handleMcp(request,env,url){
  if(request.method==="GET")return json({ok:true,service:"little-phone-mcp",version:VERSION,protocol:MCP_PROTOCOL_VERSION,tools:MCP_TOOLS.map(t=>t.name)});
  if(request.method!=="POST")return json(rpcError(null,-32000,"Use POST /mcp"),405);
  if(!tokenOk(request,env,url))return json(rpcError(null,-32001,"LINJIAN_ERR_BAD_TOKEN"),401);
  const msg=await readJson(request); const id=msg.id??null; const method=msg.method||"";
  if(msg.jsonrpc!=="2.0")return json(rpcError(id,-32600,"Invalid JSON-RPC request"),400);
  if(method==="initialize")return json(rpcResult(id,{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{tools:{}},serverInfo:{name:"little-phone",version:VERSION}}));
  if(method==="ping")return json(rpcResult(id,{}));
  if(method==="notifications/initialized")return new Response(null,{status:204,headers:corsHeaders({"MCP-Protocol-Version":MCP_PROTOCOL_VERSION})});
  if(method==="tools/list")return json(rpcResult(id,{tools:MCP_TOOLS}));
  if(method==="tools/call"){
    const name=msg.params?.name||"";const args=msg.params?.arguments||{};try{return json(rpcResult(id,await callTool(name,args,env)));}catch(err){return json(rpcResult(id,mcpText({ok:false,error:"tool_exception",detail:String(err?.message||err)},true)));}
  }
  return json(rpcError(id,-32601,`Method not found: ${method}`),404);
}
async function callTool(name,args,env){
  switch(name){
    case "little_phone_status": return mcpText({ok:true,service:"little-phone-backend",version:VERSION,screenshot:false,snapshot_ttl_minutes:30,event_ttl_days:7});
    case "visit_little_phone": {const command=await queueVisit(env,clip(args.device_id||DEFAULT_DEVICE,120));return mcpText({ok:true,mode:"read_once",command,message:"来访已排队；手机下一次轮询时只读取一次授权快照。"});}
    case "get_little_phone_snapshot": {const visit=await latestVisit(env,clip(args.device_id||DEFAULT_DEVICE,120));if(!visit)return mcpText({ok:true,has_snapshot:false,message:"还没有成功来访快照。"});if(visit.expired)return mcpText({ok:true,has_snapshot:true,fresh:false,expired:true,created_at:visit.created_at,expires_at:visit.expires_at,message:"上次快照已过期"});return mcpText({ok:true,has_snapshot:true,fresh:true,expired:false,visit});}
    case "list_little_phone_events": return mcpText({ok:true,events:await listEvents(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "leave_little_phone_trace": return mcpText({ok:true,event:await insertEvent(env,{actor:actorFromAuthor(args.author||"daddy"),type:"manual",title:clip(args.title||"daddy 留下一条痕迹",120),content:clip(args.content||"",1000),metadata:{source:"mcp"}})});
    case "leave_little_phone_paper": {const paper=await addPaper(env,args);return mcpText(paper.error?{ok:false,error:paper.error}:{ok:true,paper},Boolean(paper.error));}
    case "list_little_phone_papers": return mcpText({ok:true,papers:await listPapers(env,Math.max(1,Math.min(500,Number(args.limit||200))))});
    case "send_little_phone_letter": {const mail=await addMail(env,args);return mcpText(mail.error?{ok:false,error:mail.error}:{ok:true,mail},Boolean(mail.error));}
    case "list_little_phone_mail": return mcpText({ok:true,mail:await listMail(env,Math.max(1,Math.min(300,Number(args.limit||80))))});
    case "send_future_letter": {const c=await addCapsule(env,args);if(c.error)return mcpText({ok:false,error:c.error},true);const out={...c,locked:String(c.unlock_at)>todayUtc()};if(out.locked)delete out.content;return mcpText({ok:true,capsule:out});}
    case "list_future_letters": return mcpText({ok:true,capsules:await listCapsules(env,Math.max(1,Math.min(100,Number(args.limit||30))))});
    case "add_dailybook_entry": {const images=(Array.isArray(args.image_urls)?args.image_urls:[]).map(url=>({url}));const e=await addDailybook(env,{...args,images});return mcpText(e.error?{ok:false,error:e.error}:{ok:true,entry:e},Boolean(e.error));}
    case "list_dailybook_entries": return mcpText({ok:true,entries:await listDailybook(env,Math.max(1,Math.min(300,Number(args.limit||100))))});
    case "add_little_phone_todo": {const t=await addTodo(env,args);return mcpText(t.error?{ok:false,error:t.error}:{ok:true,todo:t},Boolean(t.error));}
    case "list_little_phone_todos": return mcpText({ok:true,todos:await listTodos(env,Math.max(1,Math.min(300,Number(args.limit||100))))});
    case "update_little_phone_todo": {const t=await updateTodo(env,args);return mcpText(t?{ok:true,todo:t}:{ok:false,error:"todo_not_found"},!t);}
    case "set_little_phone_todo_done": {const old=await getTodo(env,args.id||"");if(!old)return mcpText({ok:false,error:"todo_not_found"},true);await env.DB.prepare("UPDATE lp_todos SET done=?,updated_at=? WHERE id=?").bind(boolInt(args.done!==false),nowIso(),args.id).run();return mcpText({ok:true,todo:await getTodo(env,args.id)});}
    default:return mcpText({ok:false,error:"unknown_tool",name,available:MCP_TOOLS.map(t=>t.name)},true);
  }
}
