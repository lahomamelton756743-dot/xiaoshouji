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
  return {
    has_seed: true,
    seed: {
      scene, anchor, figure, emotion: pick(LIBRARY.emotions, random),
      change: pick(LIBRARY.changes, random), clarity,
      residue: pick(LIBRARY.residues, random),
      strange, continuity, wish_influence_possible: Boolean(wish.trim())
    }
  };
}
/** Return only fragments that can plausibly be recalled on waking. */
export function revealOnWake(seed) {
  if (!seed) return { remembered: [], clarity: null };
  const c = clamp(Number(seed.clarity) || 0, 0, 100);
  const fragments = [
    ["scene", seed.scene], ["anchor", seed.anchor], ["figure", seed.figure],
    ["emotion", seed.emotion], ["change", seed.change], ["residue", seed.residue]
  ];
  const count = c < 15 ? 1 : c < 35 ? 2 : c < 60 ? 3 : c < 80 ? 4 : 6;
  // Very low clarity preserves emotion rather than a complete story.
  const remembered = c < 15 ? [["emotion", seed.emotion]] : fragments.slice(0, count);
  return { clarity: c, remembered: remembered.map(([kind, value]) => ({ kind, value })) };
}
