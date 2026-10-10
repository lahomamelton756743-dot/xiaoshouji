import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import worker from "./worker.js";
class Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async first(){return this.db.prepare(this.sql).get(...this.args)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.args)};}
  async run(){const x=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(x.changes)}};}
}
const db=new DatabaseSync(":memory:");
const env={DB:{prepare:sql=>new Statement(db,sql)},LINJIAN_TOKEN:"test-token"};
const auth={"Authorization":"Bearer test-token","Content-Type":"application/json"};
async function request(path,method="GET",body){
  const res=await worker.fetch(new Request("https://test.local"+path,{method,headers:auth,body:body?JSON.stringify(body):undefined}),env);
  return {status:res.status,data:await res.json()};
}
await request("/api/littlephone/papers","POST",{author:"GPT",content:"变成什么样都是你，我会接住你"});
const exact=await request("/api/littlephone/memory-search?q=变成什么样都是你&mode=exact");
assert.equal(exact.status,200);
assert.ok(exact.data.results.some(x=>x.source==="papers"));
const item=exact.data.results.find(x=>x.source==="papers");
const mcp=await worker.fetch(new Request("https://test.local/mcp",{method:"POST",headers:auth,body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"gpt_get_little_phone_memory_item",arguments:{source:item.source,id:item.id}}})}),env);
const payload=await mcp.json();
assert.ok(JSON.stringify(payload).includes("变成什么样都是你"));
await request("/api/capsules","POST",{author:"GPT",content:"秘密未来信不可搜索绝密词",unlock_at:"2999-01-01"});
const hidden=await request("/api/littlephone/memory-search?q=秘密未来信不可搜索绝密词&mode=auto");
assert.equal(hidden.data.total,0);
const lockedId=db.prepare("SELECT id FROM lp_capsules LIMIT 1").get().id;
const locked=await worker.fetch(new Request("https://test.local/mcp",{method:"POST",headers:auth,body:JSON.stringify({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"gpt_get_little_phone_memory_item",arguments:{source:"capsules",id:lockedId}}})}),env);
assert.ok(!(await locked.text()).includes("秘密未来信不可搜索绝密词"));
console.log("memory-search.integration.test.mjs: PASS (HTTP + MCP + locked future letter)");
