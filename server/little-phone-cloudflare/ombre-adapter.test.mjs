import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { prepareOmbreSource, fingerprintOmbreSource, needsOmbreSync, buildRiverEntries } from "./ombre-adapter.mjs";

const diary = { id:"diary-1", author:"user", title:"今天", content:"一段真实的日记", date:"2026-09-20", updated_at:"2026-09-21" };

test("only diary and long-term memory can be prepared", () => {
  assert.equal(prepareOmbreSource("diary", diary).source_id, "diary-1");
  assert.throws(() => prepareOmbreSource("mail", diary), /Unsupported/);
  assert.throws(() => prepareOmbreSource("paper", diary), /Unsupported/);
  assert.throws(() => prepareOmbreSource("health", diary), /Unsupported/);
  assert.throws(() => prepareOmbreSource("diary", {...diary, content:""}), /content/);
});
test("source identity and content are stable and hashed without network", async () => {
  const prepared = prepareOmbreSource("diary", diary);
  assert.ok(Object.isFrozen(prepared));
  const a = await fingerprintOmbreSource(prepared, webcrypto.subtle);
  const b = await fingerprintOmbreSource(prepareOmbreSource("diary", {...diary, updated_at:"2026-09-22"}), webcrypto.subtle);
  const c = await fingerprintOmbreSource(prepareOmbreSource("diary", {...diary, content:"改过的正文"}), webcrypto.subtle);
  assert.equal(a,b);
  assert.notEqual(a,c);
  assert.equal(needsOmbreSync(a,{content_hash:a,sync_status:"synced"}),false);
  assert.equal(needsOmbreSync(a,{content_hash:a,sync_status:"failed"}),true);
});
test("river keeps original sources and excludes diaries by default", () => {
  const book = [{id:"book-1",date:"2026-09-22",title:"日常册"}];
  const first = buildRiverEntries(book,[diary]);
  assert.deepEqual(first.map(x=>x.source),["dailybook"]);
  const combined = buildRiverEntries(book,[diary],true);
  assert.deepEqual(combined.map(x=>x.source),["diary","dailybook"]);
  assert.equal(combined[0].original,diary);
  assert.equal(book.length,1);
});
