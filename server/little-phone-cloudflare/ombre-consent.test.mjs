import test from "node:test";
import assert from "node:assert/strict";
import { canSyncOmbre, planOmbreSync } from "./ombre-consent.mjs";
const hash = "a".repeat(64);
const settings = {enabled:true,sources:["diary"]};

test("OB sync defaults off and rejects private sources", () => {
  for(const type of ["diary","memory","mail","paper","chat","health"]) {
    assert.equal(canSyncOmbre(type, undefined),false);
    assert.equal(canSyncOmbre(type, {enabled:false,sources:[type]}),false);
  }
  for(const type of ["mail","paper","chat","health"]) assert.equal(canSyncOmbre(type,{enabled:true,sources:[type]}),false);
  assert.equal(canSyncOmbre("diary",settings),true);
  assert.equal(canSyncOmbre("memory",settings),false);
  assert.equal(canSyncOmbre("memory",{enabled:true,sources:["memory"]}),true);
});
test("sync plan is explicit, hash-gated and idempotent", () => {
  assert.deepEqual(planOmbreSync({type:"diary",hash}),{action:"skip",reason:"not_authorized"});
  assert.deepEqual(planOmbreSync({type:"diary",settings,hash:"invalid"}),{action:"skip",reason:"invalid_hash"});
  assert.deepEqual(planOmbreSync({type:"diary",settings,hash}),{action:"queue",reason:"new"});
  assert.deepEqual(planOmbreSync({type:"diary",settings,hash,previousLink:{content_hash:hash,sync_status:"synced"}}),{action:"skip",reason:"unchanged"});
  assert.deepEqual(planOmbreSync({type:"diary",settings,hash,previousLink:{content_hash:hash,sync_status:"failed"}}),{action:"queue",reason:"changed_or_retry"});
});
