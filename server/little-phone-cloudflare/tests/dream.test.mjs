import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rollDreamSeed, revealOnWake, DREAM_WISH_INFLUENCE_RATE } from '../dream-engine.mjs';
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

test('new dream seals a variable-length narrative and recall depends on clarity', () => {
  const values=[0.1,0.5,0.55,0.1,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5];
  let i=0;const result=rollDreamSeed({random:()=>values[i++]??0.5});
  assert.equal(result.has_seed,true);
  assert.ok(result.seed.events.length>=2 && result.seed.events.length<=20);
  assert.ok(result.seed.events.every(e=>typeof e.text==='string' && e.text.trim().length>0));
  const low=revealOnWake({...result.seed,clarity:10});
  const medium=revealOnWake({...result.seed,clarity:55});
  const high=revealOnWake({...result.seed,clarity:90});
  assert.equal(low.remembered.length,1);
  assert.equal(medium.remembered.length,3);
  assert.equal(high.remembered.length,result.seed.events.length);
  assert.equal(medium.narrative.split('\n\n').length,3);
  assert.ok(result.seed.events.length>=2 && result.seed.events.length<=20);
});
test('legacy dream seeds still reveal original fragments',()=>{
  const old={clarity:55,scene:'旧场景',anchor:'旧物件',figure:'旧人物',emotion:'旧情绪',change:'旧变化',residue:'旧余韵'};
  const recalled=revealOnWake(old);
  assert.equal(recalled.remembered.length,3);
  assert.equal(recalled.narrative,undefined);
});

test('wish influence is 90% and wish-driven events use the wish world', () => {
  assert.equal(DREAM_WISH_INFLUENCE_RATE, 0.9);
  const dream = rollDreamSeed({wish:'梦见和瑞安一起住进新家', random:()=>0.1});
  assert.equal(dream.has_seed,true);
  assert.equal(dream.seed.wish_influenced,true);
  assert.equal(dream.seed.wish_world.place,'新住处');
  assert.match(dream.seed.events[0].text,/新住处/);
  assert.ok(dream.seed.events.every(e=>typeof e.text==='string'&&e.text.length>0));
  const ordinary = rollDreamSeed({wish:'梦见瑞安', random:(()=>{let i=0;return ()=>++i===10?0.95:0.1;})()});
  assert.equal(ordinary.has_seed,true);
});

test('a sprouted wish contains actual requested relationship actions',()=>{
  const dream=rollDreamSeed({wish:'我想梦见瑞安抱着我亲亲，然后一起睡觉',random:()=>0.1});
  assert.equal(dream.has_seed,true);
  assert.equal(dream.seed.wish_influenced,true);
  const text=dream.seed.events.map(x=>x.text).join('');
  assert.match(text,/抱|怀里|拥抱/);
  assert.match(text,/亲|吻/);
  assert.match(text,/睡|被窝|醒来/);
  assert.equal(dream.seed.events.filter(x=>x.kind==='wish_fulfilled').length,3);
});
test('cat ears and tail can be fulfilled rather than merely mentioned as a setting',()=>{
  const dream=rollDreamSeed({wish:'想长出猫耳和尾巴，被瑞安抱着',random:()=>0.1});
  const text=dream.seed.events.map(x=>x.text).join('');
  assert.match(text,/猫耳/);
  assert.match(text,/尾巴/);
  assert.match(text,/抱|怀里/);
});
