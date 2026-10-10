import test from "node:test";
import assert from "node:assert/strict";
import {searchLittlePhoneMemory} from "./memory-search.mjs";

test("searches multiple sources with original identifiers", () => {
  const r=searchLittlePhoneMemory({diaries:[{id:"d1",date:"2026-09-01",title:"海边",content:"一起看日落"}],papers:[{id:"p1",created_at:"2026-09-02",content:"记得海边的日落"}]}, {query:"海边"});
  assert.equal(r.total,2);assert.deepEqual(new Set(r.results.map(x=>x.id)),new Set(["d1","p1"]));
});
test("date filters and source filters are enforced",()=>{
  const c={diaries:[{id:"a",date:"2026-09-01",content:"星星"},{id:"b",date:"2026-10-01",content:"星星"}],papers:[{id:"c",date:"2026-09-01",content:"星星"}]};
  assert.deepEqual(searchLittlePhoneMemory(c,{query:"星星",from:"2026-09-01",to:"2026-09-30",sources:["diaries"]}).results.map(x=>x.id),["a"]);
});
test("no invented matches; invalid source ignored",()=>{
  const r=searchLittlePhoneMemory({diaries:[{id:"1",content:"海风"}]},{query:"月亮",sources:["diaries","not_a_source"]});
  assert.equal(r.total,0);
});
test("does not mutate input",()=>{
  const c={diaries:[{id:"1",date:"2026-01-01",content:"hello"}]};const before=JSON.stringify(c);
  searchLittlePhoneMemory(c,{});assert.equal(JSON.stringify(c),before);
});
