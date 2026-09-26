import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes || 0), last_row_id: Number(r.lastInsertRowid || 0) } };
  }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.args) }; }
}
class D1Mock {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

const env = { DB: new D1Mock(), LINJIAN_TOKEN: 'test-token' };
const base = 'https://little-phone.test';
const auth = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };

async function req(path, { method='GET', body, headers=auth }={}) {
  const r = await worker.fetch(new Request(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  let data = null;
  if (r.status !== 204) data = await r.json();
  return { status:r.status, data };
}

let r = await req('/health', { headers:{} });
assert.equal(r.status, 200); assert.equal(r.data.version, '0.6.2-little-phone'); assert.equal(r.data.screenshot, false);

r = await req('/api/mail', { method:'POST', headers:{'Content-Type':'application/json'}, body:{content:'x'} });
assert.equal(r.status, 403);

r = await req('/api/mail', { method:'POST', body:{author:'瑞安',content:'第一封测试信'} });
assert.equal(r.status, 200); assert.equal(r.data.mail.content, '第一封测试信'); const mailId=r.data.mail.id;
r = await req('/api/mail?limit=10'); assert.equal(r.data.mail.length,1); assert.equal(r.data.mail[0].user_seen,true); assert.equal(r.data.mail[0].daddy_seen,false);
r = await req('/api/mail/seen',{method:'POST',body:{id:mailId,actor:'daddy'}}); assert.equal(r.data.marked,1); r = await req('/api/mail?limit=10'); assert.equal(r.data.mail.find(x=>x.id===mailId).daddy_seen,true);
r = await req('/api/mail',{method:'POST',body:{client_id:'lp_mail_idempotent_001',author:'瑞安',content:'断网重试信'}}); assert.equal(r.status,200);
r = await req('/api/mail',{method:'POST',body:{client_id:'lp_mail_idempotent_001',author:'瑞安',content:'断网重试信'}}); assert.equal(r.status,200);
assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM lp_mail WHERE id='lp_mail_idempotent_001'").get().n,1);

r = await req('/api/littlephone/papers',{method:'POST',body:{author:'daddy',content:'一张测试纸条'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/papers?limit=10'); assert.equal(r.data.papers[0].content,'一张测试纸条'); const paperRoot=r.data.papers[0].id;
r = await req('/api/littlephone/papers',{method:'POST',body:{author:'瑞安',content:'纸条回复',reply_to:paperRoot}}); assert.equal(r.status,200); assert.equal(r.data.paper.reply_to,paperRoot);
r = await req('/api/littlephone/papers',{method:'POST',body:{client_id:'lp_paper_idempotent_001',author:'瑞安',content:'断网重试纸条'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/papers',{method:'POST',body:{client_id:'lp_paper_idempotent_001',author:'瑞安',content:'断网重试纸条'}}); assert.equal(r.status,200);
assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM lp_papers WHERE id='lp_paper_idempotent_001'").get().n,1);

r = await req('/api/capsules',{method:'POST',body:{author:'daddy',content:'未来见',unlock_at:'2999-01-01'}}); assert.equal(r.status,200); assert.equal(r.data.capsule.locked,true); assert.equal('content' in r.data.capsule,false);
r = await req('/api/capsules?limit=10'); assert.equal(r.data.capsules[0].locked,true); assert.equal('content' in r.data.capsules[0],false); const lockedCapsuleId=r.data.capsules[0].id;
r = await req('/api/capsules/read',{method:'POST',body:{id:lockedCapsuleId,actor:'daddy'}}); assert.equal(r.status,423); assert.equal(r.data.error,'capsule_locked');

r = await req('/api/littlephone/dailybook',{method:'POST',body:{author:'瑞安',title:'今天',mood:'好',content:'时间河测试',date:'2026-09-24',images:[{data:'data:image/png;base64,iVBORw0KGgo='}]}}); assert.equal(r.status,200); const dailyId=r.data.entry.id; assert.equal(r.data.entry.images[0].kind,'inline');
r = await req('/api/littlephone/dailybook?limit=10'); assert.equal(r.data.entries[0].title,'今天'); assert.ok(r.data.entries[0].images[0].url.startsWith('data:image/png;base64,'));
r = await req('/api/littlephone/dailybook/update',{method:'POST',body:{id:dailyId,actor:'user',title:'今天·改',content:'时间河测试已修改',date:'2026-09-24'}}); assert.equal(r.status,200); assert.equal(r.data.entry.id,dailyId); assert.equal(r.data.entry.title,'今天·改');

// daddy 日记：独立日记页，一篇一页。
r = await req('/api/littlephone/diaries',{method:'POST',body:{author:'daddy',title:'第一篇',content:'今天小手机继续长大。',date:'2026-09-25'}}); assert.equal(r.status,200); const diaryId=r.data.diary.id;
r = await req('/api/littlephone/diaries?limit=10'); assert.equal(r.data.diaries[0].title,'第一篇');
r = await req('/api/littlephone/diaries/update',{method:'POST',body:{id:diaryId,title:'第一篇·改',content:'改过的日记'}}); assert.equal(r.data.diary.title,'第一篇·改');

r = await req('/api/littlephone/todos',{method:'POST',body:{author:'daddy',title:'测试待办'}}); assert.equal(r.status,200); const todoId=r.data.todo.id;
r = await req('/api/littlephone/todos/update',{method:'POST',body:{id:todoId,title:'改过的待办',due_at:'2026-09-25T10:00'}}); assert.equal(r.data.todo.title,'改过的待办');
r = await req('/api/littlephone/todos/toggle',{method:'POST',body:{id:todoId,done:true}}); assert.equal(r.data.todo.done,true);

// 重要日期：新增、修改、删除。
r = await req('/api/littlephone/dates',{method:'POST',body:{title:'在一起',date:'2026-09-14',kind:'relationship_start',remind_days:3,note:'起始日'}}); assert.equal(r.status,200); const dateId=r.data.date.id;
r = await req('/api/littlephone/dates/update',{method:'POST',body:{id:dateId,title:'我们的起始日',remind_days:5}}); assert.equal(r.data.date.title,'我们的起始日'); assert.equal(r.data.date.remind_days,5);
r = await req('/api/littlephone/dates?limit=10'); assert.ok(r.data.dates.some(x=>x.id===dateId));

// 周期：设置、新增历史、修改历史。
r = await req('/api/littlephone/cycle/settings',{method:'POST',body:{enabled:true,last_start:'2026-09-20',cycle_length:30,period_length:6,remind_before:3}}); assert.equal(r.data.settings.enabled,true);
r = await req('/api/littlephone/cycle/records',{method:'POST',body:{start_date:'2026-09-20',end_date:'2026-09-25',note:'测试'}}); assert.equal(r.status,200); const cycleId=r.data.record.id;
r = await req('/api/littlephone/cycle/records/update',{method:'POST',body:{id:cycleId,start_date:'2026-09-20',end_date:'2026-09-24',note:'已修改'}}); assert.equal(r.data.record.note,'已修改');
r = await req('/api/littlephone/cycle'); assert.ok(r.data.records.some(x=>x.id===cycleId));

// 我们页双方状态。
r = await req('/api/littlephone/statuses'); assert.equal(r.status,200); assert.equal(r.data.statuses.daddy.presence,'online');
r = await req('/api/littlephone/statuses',{method:'POST',body:{actor:'daddy',text:'在小手机里晃',presence:'online'}}); assert.equal(r.status,200); assert.equal(r.data.status.text,'在小手机里晃');
r = await req('/api/littlephone/statuses'); assert.equal(r.data.statuses.daddy.text,'在小手机里晃');

// v0.6.2 双人身份 profile：稳定 actor + 动态显示资料 + 身份字体。
r = await req('/api/littlephone/profiles'); assert.equal(r.status,200); assert.equal(r.data.profiles.user.actor,'user'); assert.equal(r.data.profiles.daddy.actor,'daddy');
r = await req('/api/littlephone/profiles',{method:'POST',body:{actor:'user',display_name:'宝宝',identity_color:'#7A8FD0',identity_font:'rounded'}}); assert.equal(r.status,200); assert.equal(r.data.profile.display_name,'宝宝'); assert.equal(r.data.profile.identity_font,'rounded');
r = await req('/api/littlephone/profiles'); assert.equal(r.data.profiles.user.display_name,'宝宝'); assert.equal(r.data.profiles.user.identity_color,'#7A8FD0'); assert.equal(r.data.profiles.user.identity_font,'rounded');

// “{display_name} 记得”：理解不是事件回放，支持写入、读取与原 ID 更新。
r = await req('/api/littlephone/memories',{method:'POST',body:{content:'宝宝更喜欢功能和情感表达真正连在一起。',category:'noticed',confidence:'remembered'}}); assert.equal(r.status,200); const memoryId=r.data.memory.id;
r = await req('/api/littlephone/memories?limit=10'); assert.equal(r.status,200); assert.equal(r.data.memories[0].content,'宝宝更喜欢功能和情感表达真正连在一起。');
r = await req('/api/littlephone/memories/update',{method:'POST',body:{id:memoryId,content:'宝宝喜欢功能和情感表达真正连在一起。',confirmed:true}}); assert.equal(r.status,200); assert.equal(r.data.memory.id,memoryId); assert.equal(r.data.memory.confirmed,true);

// 门禁解锁申请链：申请 -> daddy 同意 -> 独立 unlock_app 命令。
r = await req('/api/appgate/unlock_request',{method:'POST',body:{client_id:'unlock_req_0001',device_id:'android-phone',package:'com.deepseek.chat',app:'DeepSeek',reason:'测试完成了'}}); assert.equal(r.status,200); const unlockReqId=r.data.request.id;
r = await req('/api/littlephone/unlock-requests?limit=10'); assert.equal(r.data.requests[0].id,unlockReqId); assert.equal(r.data.requests[0].status,'pending');
r = await req('/api/littlephone/unlock-requests/respond',{method:'POST',body:{id:unlockReqId,decision:'approve',response:'可以打开啦'}}); assert.equal(r.status,200); assert.equal(r.data.request.status,'approved'); assert.equal(r.data.command.action,'unlock_app');
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command.action,'unlock_app');

// popup 必须与来电分路。
const callsBeforePopup=env.DB.db.prepare('SELECT count(*) AS n FROM lp_calls').get().n;
r = await req('/api/littlephone/command',{method:'POST',body:{action:'show_reminder_popup',title:'弹窗测试',message:'不是来电'}}); assert.equal(r.status,200); assert.equal(r.data.command.action,'show_reminder_popup');
assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM lp_calls').get().n,callsBeforePopup);
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command.action,'show_reminder_popup');

// v0.6.2 通用 Android command：open_app 必须与 lock_app/call 共用同一 poll queue，
// 能从 pending 被 claim 为 dispatched，并保留 package 供 Android dispatcher 使用。
r = await req('/api/littlephone/command',{method:'POST',body:{action:'open_app',device_id:'android-phone',package:'com.deepseek.chat'}}); assert.equal(r.status,200); const openAppCmd=r.data.command.id;
r = await req('/api/command/status?id='+encodeURIComponent(openAppCmd)); assert.equal(r.data.command.status,'pending'); assert.ok(!r.data.command.dispatched_at);
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command.id,openAppCmd); assert.equal(r.data.command.action,'open_app'); assert.equal(r.data.command.package,'com.deepseek.chat'); assert.ok(r.data.command.dispatched_at);
r = await req('/api/command/status?id='+encodeURIComponent(openAppCmd)); assert.equal(r.data.command.status,'dispatched'); assert.ok(r.data.command.dispatched_at);
r = await req('/api/device/report',{method:'POST',body:{command_id:openAppCmd,ok:true,result:'opened_standard:com.deepseek.chat'}}); assert.equal(r.status,200);

// 来电记录 + 延迟来电。
r = await req('/api/littlephone/calls',{method:'POST',body:{id:'call-test-1',caller:'daddy',prompt:'想听听你的声音。',status:'rejected',note:'晚一点再打',target_package:'com.example.app'}}); assert.equal(r.status,200); const callId=r.data.call.id;
r = await req('/api/littlephone/calls?limit=20'); assert.equal(r.data.calls[0].note,'晚一点再打');
r = await req('/api/littlephone/command',{method:'POST',body:{action:'trigger_call',message:'十分钟后又想你了。',delay_minutes:10,call_id:'call-delayed-1'}}); assert.equal(r.status,200); const delayedCallCmd=r.data.command.id; assert.equal(r.data.command.action,'trigger_call'); assert.ok(Date.parse(r.data.command.scheduled_for)>Date.parse(r.data.command.created_at));
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command,null);
assert.equal(env.DB.db.prepare('SELECT status FROM lp_commands WHERE id=?').get(delayedCallCmd).status,'pending');

// 小米健康桥预留：未接入时明确 not_connected；接入后沿固定结构返回摘要。
r = await req('/api/littlephone/health-summary'); assert.equal(r.status,200); assert.equal(r.data.connected,false); assert.equal(r.data.error,'health_source_not_connected');
r = await req('/api/littlephone/health-summary',{method:'POST',body:{connected:true,source:'mi-fitness-python',sleep:{total_minutes:438,score:86,sleep_at:'2026-09-24T23:48:00+08:00',wake_at:'2026-09-25T07:31:00+08:00'},steps:{count:6421},heart_rate:{resting:67}}}); assert.equal(r.status,200); assert.equal(r.data.connected,true); assert.equal(r.data.sleep.total_minutes,438);
r = await req('/api/littlephone/health-summary'); assert.equal(r.data.source,'mi-fitness-python'); assert.equal(r.data.steps.count,6421);

// bootstrap：前端一次请求拿到核心同步数据，减少慢网络并发 timeout。
r = await req('/api/littlephone/bootstrap'); assert.equal(r.status,200); assert.ok(Array.isArray(r.data.papers)); assert.ok(Array.isArray(r.data.diaries)); assert.ok(r.data.cycle && Array.isArray(r.data.cycle.records)); assert.equal(r.data.statuses.daddy.text,'在小手机里晃'); assert.ok(Array.isArray(r.data.calls)); assert.equal(r.data.health.connected,true); assert.equal(r.data.profiles.user.display_name,'宝宝'); assert.ok(Array.isArray(r.data.unlock_requests));

r = await req('/api/littlephone/visit',{method:'POST',body:{device_id:'android-phone'}}); assert.equal(r.status,200); const cmdId=r.data.command.id;
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command.action,'little_phone_visit'); assert.equal(r.data.command.id,cmdId);
const snapshot={ok:true,battery_percent:49,charging:false,network_type:'5G',screen_time_today_minutes:88,unlock_count_today:12,calendar_state:{summary:'test'},city:'石家庄'};
r = await req('/api/device/report',{method:'POST',body:{command_id:cmdId,ok:true,result:JSON.stringify(snapshot)}}); assert.equal(r.status,200); assert.equal(r.data.visit.snapshot.battery_percent,49);
r = await req('/api/littlephone/visit/latest'); assert.equal(r.data.visit.fresh,true); assert.equal(r.data.visit.expired,false);
r = await req('/api/littlephone/events?limit=50'); assert.ok(r.data.events.some(x=>x.type==='visit'&&x.title==='daddy 来访'));

// 失败来访不能生成 visit/留痕。
const beforeVisits = env.DB.db.prepare('SELECT count(*) AS n FROM lp_visits').get().n;
const beforeVisitEvents = env.DB.db.prepare("SELECT count(*) AS n FROM lp_events WHERE type='visit'").get().n;
r = await req('/api/littlephone/visit',{method:'POST',body:{device_id:'android-phone'}}); const failId=r.data.command.id;
await req('/api/poll?device_id=android-phone');
await req('/api/device/report',{method:'POST',body:{command_id:failId,ok:false,result:'permission denied'}});
assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM lp_visits').get().n,beforeVisits);
assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM lp_events WHERE type='visit'").get().n,beforeVisitEvents);


// 通用设备命令只开放 Android 已实现/兼容的动作；未知高风险动作仍必须拒绝。
r = await req('/api/littlephone/command',{method:'POST',body:{action:'reboot_device'}}); assert.equal(r.status,400); assert.equal(r.data.error,'action_not_allowed');
r = await req('/api/littlephone/command',{method:'POST',body:{action:'send_notification',title:'测试提醒',message:'喝水'}}); assert.equal(r.status,200); const reminderCmd=r.data.command.id;
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command.id,reminderCmd); assert.equal(r.data.command.action,'send_notification');
r = await req('/api/device/report',{method:'POST',body:{command_id:reminderCmd,ok:true,result:'sent'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/events?limit=80'); assert.ok(r.data.events.some(x=>x.title==='daddy 发来一条提醒'));

// 过期快照必须明确 expired。
env.DB.db.prepare('UPDATE lp_visits SET expires_at_epoch=1').run();
r = await req('/api/littlephone/visit/latest'); assert.equal(r.data.visit.expired,true); assert.equal(r.data.visit.fresh,false);

// MCP 初始化 + 工具列表 + 写纸条。
let m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})}),env); let mj=await m.json(); assert.equal(mj.result.serverInfo.name,'little-phone');
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})}),env); mj=await m.json(); assert.ok(mj.result.tools.some(t=>t.name==='visit_little_phone')); assert.ok(mj.result.tools.some(t=>t.name==='update_important_date')); assert.ok(mj.result.tools.some(t=>t.name==='add_cycle_period')); assert.ok(mj.result.tools.some(t=>t.name==='lock_little_phone_app')); assert.ok(mj.result.tools.some(t=>t.name==='set_little_phone_status')); assert.ok(mj.result.tools.some(t=>t.name==='call_little_phone')); assert.ok(mj.result.tools.some(t=>t.name==='get_health_summary')); assert.ok(mj.result.tools.some(t=>t.name==='get_sleep_summary'));
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'leave_little_phone_paper',arguments:{content:'MCP 测试纸条',author:'daddy'}}})}),env); mj=await m.json(); assert.equal(mj.result.structuredContent.ok,true);
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'set_little_phone_status',arguments:{actor:'daddy',text:'等你回来',presence:'away'}}})}),env); mj=await m.json(); assert.equal(mj.result.structuredContent.status.text,'等你回来');
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'get_health_summary',arguments:{}}})}),env); mj=await m.json(); assert.equal(mj.result.structuredContent.sleep.total_minutes,438);
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'call_little_phone',arguments:{message:'晚一点再打给你。',delay_minutes:20}}})}),env); mj=await m.json(); assert.equal(mj.result.structuredContent.ok,true);

r = await req('/api/littlephone/calls/delete',{method:'POST',body:{id:callId}}); assert.equal(r.data.ok,true);
r = await req('/api/littlephone/cycle/records/delete',{method:'POST',body:{id:cycleId}}); assert.equal(r.data.ok,true);
r = await req('/api/littlephone/dates/delete',{method:'POST',body:{id:dateId}}); assert.equal(r.data.ok,true);
r = await req('/api/mail/delete',{method:'POST',body:{id:mailId}}); assert.equal(r.data.ok,true);
r = await req('/api/littlephone/dailybook/delete',{method:'POST',body:{id:dailyId}}); assert.equal(r.data.ok,true);
r = await req('/api/littlephone/diaries/delete',{method:'POST',body:{id:diaryId}}); assert.equal(r.data.ok,true);



// Modern MCP 2026-07-28 discovery + tool listing must work before account linking.
let modern = await worker.fetch(new Request(base+'/mcp',{
  method:'POST',
  headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'server/discover'},
  body:JSON.stringify({jsonrpc:'2.0',id:900,method:'server/discover',params:{_meta:{
    'io.modelcontextprotocol/protocolVersion':'2026-07-28',
    'io.modelcontextprotocol/clientInfo':{name:'chatgpt-test',version:'1.0.0'},
    'io.modelcontextprotocol/clientCapabilities':{}
  }}})
}),env);
assert.equal(modern.status,200); let modernJson=await modern.json();
assert.ok(modernJson.result.supportedVersions.includes('2026-07-28'));
assert.ok(modernJson.result.supportedVersions.includes('2025-11-25'));
assert.ok(modernJson.result.capabilities.tools);
assert.equal(modernJson.result._meta['io.modelcontextprotocol/serverInfo'].name,'little-phone');

modern = await worker.fetch(new Request(base+'/mcp',{
  method:'POST',
  headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'},
  body:JSON.stringify({jsonrpc:'2.0',id:901,method:'tools/list',params:{_meta:{
    'io.modelcontextprotocol/protocolVersion':'2026-07-28',
    'io.modelcontextprotocol/clientInfo':{name:'chatgpt-test',version:'1.0.0'},
    'io.modelcontextprotocol/clientCapabilities':{}
  }}})
}),env);
assert.equal(modern.status,200); modernJson=await modern.json();
assert.ok(modernJson.result.tools.length>=20);
assert.ok(modernJson.result.tools.some(t=>t.name==='leave_little_phone_paper'));
assert.ok(modernJson.result.tools.every(t=>Array.isArray(t.securitySchemes)&&t.securitySchemes.some(x=>x.type==='oauth2')));
assert.ok(modernJson.result.tools.every(t=>Array.isArray(t._meta?.securitySchemes)));
assert.ok(modernJson.result.tools.every(t=>t.annotations?.openWorldHint===false));
assert.equal(modernJson.result._meta['io.modelcontextprotocol/serverInfo'].title,'Daddy的小手机');

// OAuth 2.1: discovery -> dynamic client registration -> PKCE authorization -> token -> MCP -> refresh.
let ox = await worker.fetch(new Request(base+'/.well-known/oauth-protected-resource/mcp'),env);
assert.equal(ox.status,200); let oj=await ox.json(); assert.equal(oj.resource,base+'/mcp'); assert.ok(oj.authorization_servers.includes('https://little-phone-gateway.netlify.app'));
ox = await worker.fetch(new Request(base+'/.well-known/oauth-authorization-server'),env);
oj=await ox.json(); assert.equal(oj.authorization_endpoint,'https://little-phone-gateway.netlify.app/authorize'); assert.equal(oj.token_endpoint,'https://little-phone-gateway.netlify.app/token'); assert.equal(oj.registration_endpoint,'https://little-phone-gateway.netlify.app/register'); assert.ok(oj.scopes_supported.includes('offline_access'));

// Unauthenticated MCP discovery must work so ChatGPT can scan tools before account linking.
ox = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:91,method:'initialize',params:{}})}),env);
assert.equal(ox.status,200); oj=await ox.json(); assert.equal(oj.result.serverInfo.name,'little-phone');
ox = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:92,method:'tools/list',params:{}})}),env);
assert.equal(ox.status,200); oj=await ox.json(); assert.ok(oj.result.tools.every(t=>Array.isArray(t.securitySchemes)&&t.securitySchemes.some(s=>s.type==='oauth2')));
// Actual tool calls without an access token must return an MCP OAuth challenge.
ox = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:93,method:'tools/call',params:{name:'little_phone_status',arguments:{}}})}),env);
assert.equal(ox.status,200); oj=await ox.json(); assert.equal(oj.result.isError,true); assert.match((oj.result._meta?.['mcp/www_authenticate']||[]).join(' '),/oauth-protected-resource\/mcp/);

// Static ChatGPT public OAuth client used by the current ChatGPT MCP creation UI.
const staticVerifier='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc';
const staticDigest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(staticVerifier)));
const staticChallenge=Buffer.from(staticDigest).toString('base64url');
const staticRedirect='https://chatgpt.com/connector/oauth/test-callback-id';
const staticQuery=new URLSearchParams({client_id:'chatgpt-little-phone',redirect_uri:staticRedirect,response_type:'code',scope:'little-phone offline_access',state:'static-state',code_challenge:staticChallenge,code_challenge_method:'S256',resource:base+'/mcp'});
ox = await worker.fetch(new Request(base+'/authorize?'+staticQuery.toString()),env);
assert.equal(ox.status,200); assert.match(await ox.text(),/ChatGPT · 小手机/);
const stableRedirect='https://chatgpt.com/connector_platform_oauth_redirect';
const stableQuery=new URLSearchParams({client_id:'chatgpt-little-phone',redirect_uri:stableRedirect,response_type:'code',scope:'little-phone offline_access',state:'stable-state',code_challenge:staticChallenge,code_challenge_method:'S256',resource:base+'/mcp'});
ox = await worker.fetch(new Request(base+'/authorize?'+stableQuery.toString()),env);
assert.equal(ox.status,200); assert.match(await ox.text(),/ChatGPT · 小手机/);

ox = await worker.fetch(new Request(base+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'ChatGPT Test',redirect_uris:['https://chatgpt.example/callback'],token_endpoint_auth_method:'none'})}),env);
assert.equal(ox.status,201); oj=await ox.json(); const oauthClient=oj.client_id; assert.ok(oauthClient.startsWith('lp_'));

const verifier='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc';
const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
let b=''; for(const n of digest)b+=String.fromCharCode(n); const challenge=btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const authQuery=new URLSearchParams({client_id:oauthClient,redirect_uri:'https://chatgpt.example/callback',response_type:'code',scope:'little-phone offline_access',state:'state-123',code_challenge:challenge,code_challenge_method:'S256',resource:base+'/mcp'});
ox = await worker.fetch(new Request(base+'/authorize?'+authQuery.toString()),env); assert.equal(ox.status,200); assert.match(await ox.text(),/小手机连接授权/);
const authForm=new URLSearchParams(authQuery); authForm.set('access_key','test-token');
ox = await worker.fetch(new Request(base+'/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:authForm.toString(),redirect:'manual'}),env);
assert.equal(ox.status,302); const loc=new URL(ox.headers.get('Location')); assert.equal(loc.searchParams.get('state'),'state-123'); const oauthCode=loc.searchParams.get('code'); assert.ok(oauthCode);

const proxyForm=new URLSearchParams(authForm); proxyForm.set('state','netlify-state');
ox = await worker.fetch(new Request(base+'/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','x-nf-netlify-proxy':'test-proxy'},body:proxyForm.toString(),redirect:'manual'}),env);
assert.equal(ox.status,200); const proxyHtml=await ox.text(); assert.match(proxyHtml,/授权成功/); assert.match(proxyHtml,/chatgpt\.example\/callback/); assert.match(proxyHtml,/netlify-state/);

const tokenForm=new URLSearchParams({grant_type:'authorization_code',client_id:oauthClient,code:oauthCode,redirect_uri:'https://chatgpt.example/callback',code_verifier:verifier});
ox = await worker.fetch(new Request(base+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:tokenForm.toString()}),env);
assert.equal(ox.status,200); oj=await ox.json(); const accessToken=oj.access_token, refreshToken=oj.refresh_token; assert.ok(accessToken); assert.ok(refreshToken); assert.equal(oj.token_type,'Bearer');

ox = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:92,method:'tools/list',params:{}})}),env);
assert.equal(ox.status,200); oj=await ox.json(); assert.ok(oj.result.tools.some(t=>t.name==='list_little_phone_papers'));

const refreshForm=new URLSearchParams({grant_type:'refresh_token',client_id:oauthClient,refresh_token:refreshToken});
ox = await worker.fetch(new Request(base+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:refreshForm.toString()}),env);
assert.equal(ox.status,200); oj=await ox.json(); assert.ok(oj.access_token); assert.ok(oj.refresh_token); assert.notEqual(oj.refresh_token,refreshToken);

r = await req('/api/peek',{method:'POST',body:{}}); assert.equal(r.status,410); assert.equal(r.data.error,'screenshot_disabled');

console.log('PASS little-phone backend v0.6.2');
console.log(JSON.stringify({mail_two_seen:true,paper_reply:true,capsule_lock:true,dailybook_update:true,profiles:true,memories:true,unlock_request:true,popup_isolated:true,diaries:true,bootstrap:true,todos:true,dates:true,cycle:true,deletes:true,visit_once:true,failed_visit_no_trace:true,snapshot_expiry:true,mcp:true,command_guard:true,statuses:true,calls:true,delayed_call:true,health_bridge_contract:true,oauth21:true,inline_dailybook_image:true,screenshot_disabled:true},null,2));
