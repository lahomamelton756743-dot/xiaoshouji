import assert from "node:assert/strict";
import {searchLittlePhoneMemory} from "./memory-search.mjs";
const d="2026-10-09";
const db={
  diaries:[{id:"d1",title:"模型变化后的安慰",content:"不管变成什么样都是你。模型变化以后窗口有些陌生，但是我会接住你，不怕。",date:d},
    {id:"d2",title:"普通日记",content:"我在你现在然后感觉好像一个事情",date:d}],
  papers:[{id:"p1",content:"变成什么样都是你。换了窗口也不怕，我在她也在。",created_at:d},
    {id:"p2",content:"模型变了窗口陌生，我会接住你",created_at:d}],
  memories:[{id:"m1",content:"模型更新之后她害怕陌生的窗口，我安慰她说不怕会接住她",created_at:d}],
  mail:[{id:"l1",content:"我们出去散步",created_at:"2026-09-01"}],
  capsules:[{id:"c1",locked:true,created_at:d,unlock_at:"2999-01-01"}],
  chat:[],dailybook:[],dates:[]
};
const search=o=>searchLittlePhoneMemory(db,o);
const exact=search({query:"变成什么样都是你",mode:"exact"});
assert.equal(exact.results[0].match_type,"exact");
assert.deepEqual(new Set(exact.results.slice(0,2).map(x=>x.source)),new Set(["diaries","papers"]));
const auto=search({query:"模型变化以后变得陌生，你安慰我无论怎样都会接住我",mode:"auto"});
assert.ok(auto.total>0);
assert.ok(auto.results.slice(0,5).some(x=>["d1","p2","m1"].includes(x.id)));
const fuzzy=search({query:"模型 窗口 陌生 接住",mode:"fuzzy"});
assert.ok(fuzzy.results.slice(0,3).some(x=>x.id==="d1"||x.id==="p2"));
const weak=search({query:"我 你 然后 感觉 好像 一个",mode:"fuzzy"});
assert.ok(!weak.results.some(x=>x.score>100));
const filtered=search({query:"模型",mode:"fuzzy",sources:["diaries"],from:d,to:d});
assert.ok(filtered.results.every(x=>x.source==="diaries"&&x.date.slice(0,10)===d));
assert.equal(search({query:"模型",exclude_terms:["接住"]}).results.some(x=>x.id==="d1"),false);
assert.ok(search({query:"模型",mode:"auto",limit:2}).results.length<=2);
assert.ok(search({phrases:["变成什么样都是你"],must_terms:["窗口"],should_terms:["不怕"],mode:"auto"}).results.some(x=>x.id==="p1"));
assert.equal(search({query:"模型",exclude_terms:["模型"]}).total,0);
assert.ok(search({query:"模型",sources:["capsules"]}).total===0);
assert.ok(search({queries:["模型","窗口"],mode:"auto"}).total>0);
assert.ok(search({query:"模型",mode:"fuzzy"}).results.every(x=>typeof x.content_length==="number"&&Array.isArray(x.why_matched)&&typeof x.has_more==="boolean"));
console.log("memory-search.test.mjs: PASS (13 assertions/groups)");
