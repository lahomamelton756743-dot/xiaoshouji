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
assert.equal(r.status, 200); assert.equal(r.data.version, '0.5.1-little-phone'); assert.equal(r.data.screenshot, false);

r = await req('/api/mail', { method:'POST', headers:{'Content-Type':'application/json'}, body:{content:'x'} });
assert.equal(r.status, 403);

r = await req('/api/mail', { method:'POST', body:{author:'瑞安',content:'第一封测试信'} });
assert.equal(r.status, 200); assert.equal(r.data.mail.content, '第一封测试信'); const mailId=r.data.mail.id;
r = await req('/api/mail?limit=10'); assert.equal(r.data.mail.length,1); assert.equal(r.data.mail[0].seen,false);
r = await req('/api/mail/seen',{method:'POST',body:{id:mailId}}); assert.equal(r.data.marked,1);

r = await req('/api/littlephone/papers',{method:'POST',body:{author:'daddy',content:'一张测试纸条'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/papers?limit=10'); assert.equal(r.data.papers[0].content,'一张测试纸条');

r = await req('/api/capsules',{method:'POST',body:{author:'daddy',content:'未来见',unlock_at:'2999-01-01'}}); assert.equal(r.status,200); assert.equal(r.data.capsule.locked,true); assert.equal('content' in r.data.capsule,false);
r = await req('/api/capsules?limit=10'); assert.equal(r.data.capsules[0].locked,true); assert.equal('content' in r.data.capsules[0],false);

r = await req('/api/littlephone/dailybook',{method:'POST',body:{author:'瑞安',title:'今天',mood:'好',content:'时间河测试',date:'2026-09-24'}}); assert.equal(r.status,200);
r = await req('/api/littlephone/dailybook?limit=10'); assert.equal(r.data.entries[0].title,'今天');

r = await req('/api/littlephone/todos',{method:'POST',body:{author:'daddy',title:'测试待办'}}); assert.equal(r.status,200); const todoId=r.data.todo.id;
r = await req('/api/littlephone/todos/update',{method:'POST',body:{id:todoId,title:'改过的待办',due_at:'2026-09-25T10:00'}}); assert.equal(r.data.todo.title,'改过的待办');
r = await req('/api/littlephone/todos/toggle',{method:'POST',body:{id:todoId,done:true}}); assert.equal(r.data.todo.done,true);

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

// 过期快照必须明确 expired。
env.DB.db.prepare('UPDATE lp_visits SET expires_at_epoch=1').run();
r = await req('/api/littlephone/visit/latest'); assert.equal(r.data.visit.expired,true); assert.equal(r.data.visit.fresh,false);

// MCP 初始化 + 工具列表 + 写纸条。
let m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})}),env); let mj=await m.json(); assert.equal(mj.result.serverInfo.name,'little-phone');
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})}),env); mj=await m.json(); assert.ok(mj.result.tools.some(t=>t.name==='visit_little_phone'));
m = await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'leave_little_phone_paper',arguments:{content:'MCP 测试纸条',author:'daddy'}}})}),env); mj=await m.json(); assert.equal(mj.result.structuredContent.ok,true);

r = await req('/api/peek',{method:'POST',body:{}}); assert.equal(r.status,410); assert.equal(r.data.error,'screenshot_disabled');

console.log('PASS little-phone backend v0.5.1');
console.log(JSON.stringify({mail:true,papers:true,capsules:true,dailybook:true,todos:true,visit_once:true,failed_visit_no_trace:true,snapshot_expiry:true,mcp:true,screenshot_disabled:true},null,2));
