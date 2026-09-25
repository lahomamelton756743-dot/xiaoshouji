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
assert.equal(r.status, 200); assert.equal(r.data.version, '0.5.2-little-phone'); assert.equal(r.data.screenshot, false);

r = await req('/api/mail', { method:'POST', headers:{'Content-Type':'application/json'}, body:{content:'x'} });
assert.equal(r.status, 403);

r = await req('/api/mail', { method:'POST', body:{author:'瑞安',content:'第一封测试信'} });
assert.equal(r.status, 200); assert.equal(r.data.mail.content, '第一封测试信'); const mailId=r.data.mail.id;
r = await req('/api/mail?limit=10'); assert.equal(r.data.mail.length,1); assert.equal(r.data.mail[0].seen,false);
r = await req('/api/mail/seen',{method:'POST',body:{id:mailId}}); assert.equal(r.data.marked,1);
r = await req('/api/mail',{method:'POST',body:{client_id:'lp_mail_idempotent_001',author:'瑞安',content:'断网重试信'}}); assert.equal(r.status,200);
r = await req('/api/mail',{method:'POST',body:{client_id:'lp_mail_idempotent_001',author:'瑞安',content:'断网重试信'}}); assert.equal(r.status,200);
assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM lp_mail WHERE id='lp_mail_idempotent_001'").get().n,1);

r = await req('/api/littlephone/papers',{method:'POST',body:{author:'daddy',content:'一张测试纸条'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/papers?limit=10'); assert.equal(r.data.papers[0].content,'一张测试纸条');
r = await req('/api/littlephone/papers',{method:'POST',body:{client_id:'lp_paper_idempotent_001',author:'瑞安',content:'断网重试纸条'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/papers',{method:'POST',body:{client_id:'lp_paper_idempotent_001',author:'瑞安',content:'断网重试纸条'}}); assert.equal(r.status,200);
assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM lp_papers WHERE id='lp_paper_idempotent_001'").get().n,1);

r = await req('/api/capsules',{method:'POST',body:{author:'daddy',content:'未来见',unlock_at:'2999-01-01'}}); assert.equal(r.status,200); assert.equal(r.data.capsule.locked,true); assert.equal('content' in r.data.capsule,false);
r = await req('/api/capsules?limit=10'); assert.equal(r.data.capsules[0].locked,true); assert.equal('content' in r.data.capsules[0],false);

r = await req('/api/littlephone/dailybook',{method:'POST',body:{author:'瑞安',title:'今天',mood:'好',content:'时间河测试',date:'2026-09-24',images:[{data:'data:image/png;base64,iVBORw0KGgo='}]}}); assert.equal(r.status,200); const dailyId=r.data.entry.id; assert.equal(r.data.entry.images[0].kind,'inline');
r = await req('/api/littlephone/dailybook?limit=10'); assert.equal(r.data.entries[0].title,'今天'); assert.ok(r.data.entries[0].images[0].url.startsWith('data:image/png;base64,'));

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

// 来电记录 + 延迟来电。
r = await req('/api/littlephone/calls',{method:'POST',body:{id:'call-test-1',caller:'daddy',prompt:'想听听你的声音。',status:'rejected',note:'晚一点再打',target_package:'com.example.app'}}); assert.equal(r.status,200); const callId=r.data.call.id;
r = await req('/api/littlephone/calls?limit=20'); assert.equal(r.data.calls[0].note,'晚一点再打');
r = await req('/api/littlephone/command',{method:'POST',body:{action:'trigger_call',message:'十分钟后又想你了。',delay_minutes:10,call_id:'call-delayed-1'}}); assert.equal(r.status,200); const delayedCallCmd=r.data.command.id;
r = await req('/api/poll?device_id=android-phone'); assert.equal(r.data.command,null);
assert.equal(env.DB.db.prepare('SELECT status FROM lp_commands WHERE id=?').get(delayedCallCmd).status,'pending');

// 小米健康桥预留：未接入时明确 not_connected；接入后沿固定结构返回摘要。
r = await req('/api/littlephone/health-summary'); assert.equal(r.status,200); assert.equal(r.data.connected,false); assert.equal(r.data.error,'health_source_not_connected');
r = await req('/api/littlephone/health-summary',{method:'POST',body:{connected:true,source:'mi-fitness-python',sleep:{total_minutes:438,score:86,sleep_at:'2026-09-24T23:48:00+08:00',wake_at:'2026-09-25T07:31:00+08:00'},steps:{count:6421},heart_rate:{resting:67}}}); assert.equal(r.status,200); assert.equal(r.data.connected,true); assert.equal(r.data.sleep.total_minutes,438);
r = await req('/api/littlephone/health-summary'); assert.equal(r.data.source,'mi-fitness-python'); assert.equal(r.data.steps.count,6421);

// bootstrap：前端一次请求拿到核心同步数据，减少慢网络并发 timeout。
r = await req('/api/littlephone/bootstrap'); assert.equal(r.status,200); assert.ok(Array.isArray(r.data.papers)); assert.ok(Array.isArray(r.data.diaries)); assert.ok(r.data.cycle && Array.isArray(r.data.cycle.records)); assert.equal(r.data.statuses.daddy.text,'在小手机里晃'); assert.ok(Array.isArray(r.data.calls)); assert.equal(r.data.health.connected,true);

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


// 通用设备命令必须限制在小手机明确开放的提醒/门禁动作中。
r = await req('/api/littlephone/command',{method:'POST',body:{action:'tap',x:10,y:10}}); assert.equal(r.status,400); assert.equal(r.data.error,'action_not_allowed');
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

r = await req('/api/peek',{method:'POST',body:{}}); assert.equal(r.status,410); assert.equal(r.data.error,'screenshot_disabled');

console.log('PASS little-phone backend v0.5.2');
console.log(JSON.stringify({mail:true,papers:true,capsules:true,dailybook:true,diaries:true,bootstrap:true,todos:true,dates:true,cycle:true,deletes:true,visit_once:true,failed_visit_no_trace:true,snapshot_expiry:true,mcp:true,command_guard:true,statuses:true,calls:true,delayed_call:true,health_bridge_contract:true,inline_dailybook_image:true,screenshot_disabled:true},null,2));
