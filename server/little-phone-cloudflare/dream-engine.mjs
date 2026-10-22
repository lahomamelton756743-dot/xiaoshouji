/**
 * Dream seed engine for 归栖.
 * Pure functions; caller must persist sleep session and enforce one roll per session.
 * No AI-generated conclusions or forced story arcs.
 */
export const DREAM_SEED_RATE = 0.35;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pick = (items, random) => items[Math.floor(random() * items.length)];
const LIBRARY = {
  scenes: ["凌晨仍在营业的海底便利店", "雨后空无一人的电影院", "漂浮在云层里的工作室", "陌生城市尽头的玻璃车站", "长满苔藓的空中庭院"],
  anchors: ["没有影子的透明雨伞", "一封没有收件人的信", "停在半空的纸飞机", "一只会发光的白色甲虫", "没有指针的怀表"],
  figures: ["不认识的旅人", "一只古怪的小动物", "没有面孔的店员", "瑞安", "独自一人"],
  emotions: ["安心里夹着一点焦急", "说不清来由的快乐", "温暖而陌生的安心", "似曾相识的失落"],
  changes: ["货架尽头忽然变成学校走廊", "所有钟表开始倒着走", "窗外的月亮沉入海底", "远处传来自己的声音"],
  residues: ["醒来仍记得手心很暖", "耳边仿佛还有雨声", "只剩一点说不清的惆怅", "醒来时莫名想笑"]
};
function weightedPick(base, weighted, random, extraWeight = 0.12) {
  if (weighted?.length && random() < extraWeight) return pick(weighted, random);
  return pick(base, random);
}

const OPENINGS = [
  ({scene,figure}) => `我走进${scene}，看见${figure}正站在不远处。`,
  ({scene,figure}) => `梦里我原本只是路过${scene}，却发现${figure}似乎在等我。`,
  ({scene,figure}) => `不知道为什么，我忽然置身于${scene}，身边只有${figure}。`,
  ({scene,figure}) => `我在${scene}醒过神来，${figure}已经先一步走向深处。`
];
const DISCOVERIES = [
  ({anchor}) => `我追过去时，注意到${anchor}，忍不住停下脚步。`,
  ({anchor}) => `就在这时，${anchor}出现在眼前，像是专门留给我的线索。`,
  ({anchor}) => `我想问清楚发生了什么，${anchor}却突然挡住了去路。`,
  ({anchor}) => `四周安静得奇怪，只有${anchor}让我确信这里并非现实。`
];
const ENCOUNTERS = [
  ({figure}) => `我试着向${figure}搭话，对方却只指了指远处。`,
  ({figure}) => `我跟着${figure}往前走，走着走着竟忘了自己为什么来到这里。`,
  ({figure}) => `${figure}像是认识我，却说出一句我醒来后也无法完整复述的话。`,
  ({figure}) => `我刚想靠近${figure}，对方就突然停住了脚步。`
];
const TURNS = [
  ({change}) => `紧接着，${change}，原本熟悉的方向全乱了。`,
  ({change}) => `还没来得及反应，${change}。我只能顺着变化继续往前。`,
  ({change}) => `我以为一切就要结束，没想到${change}。`,
  ({change}) => `就在我回头的一瞬间，${change}。`
];
const ENDINGS = [
  ({residue}) => `后来画面突然断掉，醒来时${residue}。`,
  ({residue}) => `我还想再看一眼，周围却慢慢淡去；${residue}。`,
  ({residue}) => `最后我没有找到出口，只记得${residue}。`,
  ({residue}) => `梦就在某个不合逻辑的瞬间结束了，${residue}。`
];
function buildDreamEvents(seed,random){
  const events=[
    {kind:"opening",text:pick(OPENINGS,random)(seed)},
    {kind:"discovery",text:pick(DISCOVERIES,random)(seed)},
    {kind:"encounter",text:pick(ENCOUNTERS,random)(seed)},
    {kind:"turn",text:pick(TURNS,random)(seed)},
    {kind:"ending",text:pick(ENDINGS,random)(seed)}
  ];
  return events;
}
function recallEvents(seed,c){
  const events=seed?.events;
  if(!Array.isArray(events)||!events.length)return null; // Historical dreams keep their original fragment behavior.
  const indices=c<15?[4]:c<35?[0,4]:c<60?[0,1,4]:c<80?[0,1,3,4]:[0,1,2,3,4];
  const remembered=indices.map(i=>events[i]).filter(e=>e&&typeof e.text==="string");
  return {remembered, narrative:remembered.map(e=>e.text).join("\n\n")};
}

/**
 * wish/recentElements are candidate fragments only, not instructions.
 * dreamSeedRate remains 35% regardless of wish or conversation history.
 */
export function rollDreamSeed({ wish = "", recentElements = [], previousAnchors = [], random = Math.random } = {}) {
  if (random() >= DREAM_SEED_RATE) return { has_seed: false, seed: null };
  const continuity = previousAnchors.length > 0 && random() < 0.05;
  const clarity = Math.floor(random() * 101);
  const strange = random() < 0.025;
  const related = recentElements.filter(x => typeof x === "string" && x.trim()).slice(0, 12);
  const anchor = continuity ? pick(previousAnchors, random) : pick(LIBRARY.anchors, random);
  const scene = weightedPick(LIBRARY.scenes, related, random);
  const figure = weightedPick(LIBRARY.figures, related, random);
  const seed = {
      scene, anchor, figure, emotion: pick(LIBRARY.emotions, random),
      change: pick(LIBRARY.changes, random), clarity,
      residue: pick(LIBRARY.residues, random),
      strange, continuity, wish_influence_possible: Boolean(wish.trim())
  };
  seed.events=buildDreamEvents(seed,random);
  return {has_seed:true,seed};
}
/** Return only fragments that can plausibly be recalled on waking. */
export function revealOnWake(seed) {
  if (!seed) return { remembered: [], clarity: null };
  const c = clamp(Number(seed.clarity) || 0, 0, 100);
  const eventRecall=recallEvents(seed,c);
  if(eventRecall)return {clarity:c,...eventRecall};
  const fragments = [
    ["scene", seed.scene], ["anchor", seed.anchor], ["figure", seed.figure],
    ["emotion", seed.emotion], ["change", seed.change], ["residue", seed.residue]
  ];
  const count = c < 15 ? 1 : c < 35 ? 2 : c < 60 ? 3 : c < 80 ? 4 : 6;
  // Very low clarity preserves emotion rather than a complete story.
  const remembered = c < 15 ? [["emotion", seed.emotion]] : fragments.slice(0, count);
  return { clarity: c, remembered: remembered.map(([kind, value]) => ({ kind, value })) };
}
