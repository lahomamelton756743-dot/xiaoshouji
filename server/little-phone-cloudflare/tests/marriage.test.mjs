import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listMarriage,saveUserMarriage,saveDaddyMarriageVow } from '../marriage.mjs';

const db = new DatabaseSync(':memory:');
const env = { DB: {prepare(sql){
  const stmt=db.prepare(sql);
  return {
    bind(...args){return {run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)}}
  };
}}};
test('marriage archive protects independent vows and persists each month', async()=>{
 assert.deepEqual((await listMarriage(env)).records,[]);
 const first=await saveUserMarriage(env,{key:'first',occasion:'first',date:'2026-11-25',title:'我们的婚礼',user_vow:'我愿意',certificate_text:'婚书',theme:'初婚'});
 assert.equal(first.ok,true);
 const month=await saveUserMarriage(env,{key:'2026-12',occasion:'month',date:'2026-12-25',title:'十二月的约定',user_vow:'这个月也喜欢你'});
 assert.equal(month.ok,true);
 const invalid=await saveUserMarriage(env,{key:'2026-12',occasion:'month',date:'2027-01-01',title:'错月'});
 assert.equal(invalid.error,'invalid_date');
 const daddy=await saveDaddyMarriageVow(env,{key:'2026-12',vow:'我也依然选择你'});
 assert.equal(daddy.record.daddy_vow,'我也依然选择你');
 assert.equal(daddy.record.user_vow,'这个月也喜欢你');
 await saveUserMarriage(env,{key:'2026-12',occasion:'anniversary',date:'2026-12-25',title:'周年',user_vow:'我再次许诺',certificate_text:'周年婚书'});
 const records=(await listMarriage(env)).records;
 assert.equal(records.length,2);
 assert.equal(records.find(r=>r.key==='2026-12').daddy_vow,'我也依然选择你');
 assert.equal(records.find(r=>r.key==='2026-12').occasion,'anniversary');
 assert.equal(records.find(r=>r.key==='first').certificate_text,'婚书');
 assert.equal((await saveDaddyMarriageVow(env,{key:'2026-12',vow:''})).error,'vow_required');
});
