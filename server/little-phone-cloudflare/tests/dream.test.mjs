import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rollDreamSeed, revealOnWake } from '../dream-engine.mjs';
import { dreamAction } from '../dream-service.mjs';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  return { DB: { prepare(sql) {
    return { bind(...values) {
      const stmt = db.prepare(sql);
      return {
        run: async () => ({ meta: { changes: stmt.run(...values).changes } }),
        first: async () => stmt.get(...values) ?? null,
        all: async () => ({ results: stmt.all(...values) })
      };
    }, run: async () => ({ meta: { changes: db.prepare(sql).run().changes } }) };
  } } };
}

test('35% threshold and deterministic no-seed', () => {
  assert.equal(rollDreamSeed({ random: () => 0.9 }).has_seed, false);
  assert.equal(rollDreamSeed({ random: () => 0.1 }).has_seed, true);
});
test('clarity limits recalled fragments', () => {
  const seed = { clarity: 2, emotion: '平静', scene: '车站', anchor: '信', figure: '旅人', change: '下雨', residue: '暖意' };
  assert.deepEqual(revealOnWake(seed).remembered, [{ kind: 'emotion', value: '平静' }]);
  assert.equal(revealOnWake({ ...seed, clarity: 100 }).remembered.length, 6);
});
test('sleep, list, wake, write, share lifecycle', async () => {
  const env = makeEnv();
  const first = await dreamAction(env, 'sleep', { wish: '晚安' });
  assert.equal(first.ok, true);
  assert.equal(first.dream.status, 'asleep');
  assert.equal('has_seed' in first.dream, false);
  const duplicate = await dreamAction(env, 'sleep', {});
  assert.equal(duplicate.already_asleep, true);
  assert.equal(duplicate.dream.has_seed, null);
  assert.equal(duplicate.dream.id, first.dream.id);
  const listed = await dreamAction(env, 'list');
  assert.equal(listed.dreams.length, 1);
  assert.equal(listed.dreams[0].has_seed, null);
  assert.equal('sealed_seed' in listed.dreams[0], false);
  assert.equal((await dreamAction(env, 'write', { id: first.dream.id, story: 'test' })).error, 'must_wake_first');
  const wake = await dreamAction(env, 'wake', { id: first.dream.id });
  assert.equal(wake.dream.status, 'awake');
  assert.equal((await dreamAction(env, 'wake', { id: first.dream.id })).already_awake, true);
  if (wake.dream.has_seed) {
    assert.equal((await dreamAction(env, 'write', { id: first.dream.id, story: '雨夜' })).ok, true);
  } else {
    assert.equal((await dreamAction(env, 'write', { id: first.dream.id, story: '雨夜' })).error, 'no_seed_to_write');
  }
  assert.equal((await dreamAction(env, 'share', { id: first.dream.id, text: '只记得很暖' })).ok, true);
  const end = await dreamAction(env, 'list');
  assert.equal(end.dreams[0].share_text, '只记得很暖');
});
test('two simultaneous sleep calls cannot create two active dreams', async () => {
  const env = makeEnv();
  const results = await Promise.all([dreamAction(env, 'sleep'), dreamAction(env, 'sleep')]);
  assert.ok(results.every(x => x.ok));
  assert.equal(results[0].dream.id, results[1].dream.id);
  assert.equal((await dreamAction(env, 'list')).dreams.length, 1);
});
