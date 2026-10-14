import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { createGift, listGifts, openGift, creatorReadGift, creatorListGifts, updateGift, giftVersions, restoreGiftVersion, deleteGift, restoreGift } from "./gifts.mjs";

globalThis.crypto ??= webcrypto;
function fixture() {
 const sqlite = new DatabaseSync(":memory:");
 const DB = {prepare(sql) {
  const stmt = sqlite.prepare(sql);
  let values = [];
  return {
   bind(...args) { values=args; return this; },
   run() { const x=stmt.run(...values); return {meta:{changes:x.changes}}; },
   first() { return stmt.get(...values)??null; },
   all() { return {results:stmt.all(...values)}; }
  };
 }};
 return {DB};
}
async function unpack(response) {return {status:response.status,...await response.json()};}
test("drafts, locked gifts, creator notes, version restore, trash",async()=>{
 const env=fixture();
 const draft=await unpack(await createGift(env,{title:"unfinished",gift_state:"draft",creator_note:"secret"}));
 assert.equal(draft.status,201);
 const creator=await unpack(await creatorListGifts(env));
 assert.equal(creator.gifts.length,1);
 const id=creator.gifts[0].id;
 assert.equal((await unpack(await listGifts(env))).gifts.length,0);
 assert.equal((await unpack(await openGift(env,id))).status,423);
 assert.equal((await unpack(await creatorReadGift(env,id))).gift.creator_note,"secret");
 const future="2099-01-01T00:00:00Z";
 assert.equal((await unpack(await updateGift(env,{id,title:"birthday",html:"<h1>v1</h1>",gift_state:"published",unlock_at:future,preview_mode:"none"}))).ok,true);
 assert.equal((await unpack(await listGifts(env))).gifts.length,0);
 assert.equal((await unpack(await openGift(env,id))).status,423);
 assert.equal((await unpack(await updateGift(env,{id,html:"<h1>v2</h1>",unlock_at:null}))).ok,true);
 assert.equal((await unpack(await openGift(env,id))).html,"<h1>v2</h1>");
 const versions=await unpack(await giftVersions(env,id));
 assert.equal(versions.versions.length,2);
 assert.equal((await unpack(await restoreGiftVersion(env,id,2))).ok,true);
 assert.equal((await unpack(await openGift(env,id))).status,423);
 assert.equal((await unpack(await creatorReadGift(env,id))).gift.html,"<h1>v1</h1>");
 assert.equal((await unpack(await deleteGift(env,id))).deleted,true);
 assert.equal((await unpack(await listGifts(env))).gifts.length,0);
 assert.equal((await unpack(await creatorListGifts(env,true))).gifts.length,1);
 assert.equal((await unpack(await restoreGift(env,id))).restored,true);
 assert.equal((await unpack(await creatorListGifts(env,true))).gifts.length,0);
});
test("isolated databases each initialize their own schema",async()=>{
 const a=fixture(),b=fixture();
 assert.equal((await unpack(await createGift(a,{title:"a",html:"A"}))).status,201);
 assert.equal((await unpack(await createGift(b,{title:"b",html:"B"}))).status,201);
 assert.equal((await unpack(await listGifts(a))).gifts.length,1);
 assert.equal((await unpack(await listGifts(b))).gifts.length,1);
});
