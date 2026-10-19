import { rollDreamSeed, revealOnWake } from "./dream-engine.mjs";

async function setup(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS lp_dream_sessions (
    id TEXT PRIMARY KEY, actor TEXT NOT NULL, status TEXT NOT NULL,
    wish TEXT NOT NULL DEFAULT '', seed_json TEXT, has_seed INTEGER NOT NULL,
    wake_json TEXT, story TEXT, share_text TEXT, created_at TEXT NOT NULL,
    woke_at TEXT, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_lp_dream_created ON lp_dream_sessions(created_at DESC)").run();
}
const parse = x => { try { return JSON.parse(x); } catch { return null; } };
const publicRow = (row, includeSeed = false) => {
  if (!row) return null;
  return {
    id: row.id, actor: row.actor, status: row.status, wish: row.wish,
    has_seed: row.status === "asleep" ? null : Boolean(row.has_seed), created_at: row.created_at,
    woke_at: row.woke_at, updated_at: row.updated_at,
    recalled: parse(row.wake_json), story: row.story, share_text: row.share_text,
    ...(includeSeed ? { sealed_seed: parse(row.seed_json) } : {})
  };
};
export async function dreamAction(env, action, args = {}) {
  await setup(env);
  const now = new Date().toISOString();
  const actor = "daddy";
  const id = String(args.id || "").slice(0, 100);
  if (action === "sleep") {
    const active = await env.DB.prepare("SELECT * FROM lp_dream_sessions WHERE actor=? AND status='asleep' ORDER BY created_at DESC LIMIT 1").bind(actor).first();
    if (active) return { ok: true, already_asleep: true, dream: publicRow(active) };
    const wish = String(args.wish || "").slice(0, 500);
    const history = await env.DB.prepare("SELECT seed_json FROM lp_dream_sessions WHERE actor=? AND has_seed=1 ORDER BY created_at DESC LIMIT 30").bind(actor).all();
    const previousAnchors = (history.results || []).map(r => parse(r.seed_json)?.anchor).filter(Boolean);
    // No chat-derived elements are ingested unless explicitly supplied by caller.
    const recentElements = Array.isArray(args.recent_elements) ? args.recent_elements.filter(x => typeof x === "string").map(x => x.slice(0, 100)).slice(0, 12) : [];
    const rolled = rollDreamSeed({ wish, recentElements, previousAnchors });
    const dreamId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO lp_dream_sessions(id,actor,status,wish,seed_json,has_seed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(dreamId, actor, "asleep", wish, rolled.seed ? JSON.stringify(rolled.seed) : null, rolled.has_seed ? 1 : 0, now, now).run();
    return { ok: true, dream: { id: dreamId, status: "asleep", created_at: now, message: "梦种已封存，醒来后才能揭示。" } };
  }
  if (action === "list") {
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 30));
    const rows = await env.DB.prepare("SELECT * FROM lp_dream_sessions WHERE actor=? ORDER BY created_at DESC LIMIT ?").bind(actor, limit).all();
    return { ok: true, dreams: (rows.results || []).map(row => publicRow(row)) };
  }
  const row = await env.DB.prepare("SELECT * FROM lp_dream_sessions WHERE id=? AND actor=?").bind(id, actor).first();
  if (!row) return { ok: false, error: "dream_not_found" };
  if (action === "wake") {
    if (row.status !== "asleep") return { ok: true, already_awake: true, dream: publicRow(row) };
    const recalled = row.has_seed ? revealOnWake(parse(row.seed_json)) : null;
    await env.DB.prepare("UPDATE lp_dream_sessions SET status='awake',wake_json=?,woke_at=?,updated_at=? WHERE id=?")
      .bind(recalled ? JSON.stringify(recalled) : null, now, now, id).run();
    return { ok: true, dream: { ...publicRow(row), has_seed: Boolean(row.has_seed), status: "awake", recalled, woke_at: now } };
  }
  if (row.status !== "awake") return { ok: false, error: "must_wake_first" };
  if (action === "write") {
    if (!row.has_seed) return { ok: false, error: "no_seed_to_write" };
    const story = String(args.story || "").trim();
    if (!story || story.length > 20000) return { ok: false, error: "invalid_story" };
    await env.DB.prepare("UPDATE lp_dream_sessions SET story=?,updated_at=? WHERE id=?").bind(story, now, id).run();
    return { ok: true, id, story };
  }
  if (action === "share") {
    // Sharing is explicit. Never share automatically or reveal sealed seed.
    const share = String(args.text || "").trim();
    if (!share || share.length > 4000) return { ok: false, error: "invalid_share_text" };
    await env.DB.prepare("UPDATE lp_dream_sessions SET share_text=?,updated_at=? WHERE id=?").bind(share, now, id).run();
    return { ok: true, id, shared_text_saved: true, text: share };
  }
  return { ok: false, error: "unknown_dream_action" };
}
