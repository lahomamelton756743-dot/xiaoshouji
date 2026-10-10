/** 0.8.5: read-only memory search over already fetched Little Phone records.
 * No storage mutation, network calls, or synthetic memories.
 */
const SOURCES = Object.freeze(["diaries","memories","papers","mail","capsules","chat","dailybook","dates","annotations"]);
const LIMIT_MAX = 1000000;
const TEXT_MAX = 240;

function plain(value) { return typeof value === "string" ? value : ""; }
function clamp(value, fallback, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : fallback; }
function dateOf(row) { return plain(row.date || row.event_date || row.created_at || row.updated_at || row.send_at || row.deliver_at); }
function textOf(row) { return [row.title,row.content,row.body,row.text,row.description,row.name,row.category].map(plain).filter(Boolean).join("\n"); }
function norm(value) { return plain(value).normalize("NFKC").toLocaleLowerCase(); }

/** Return matches only from caller-provided, authorized records. */
export function searchLittlePhoneMemory(collections, options = {}) {
  const query = norm(options.query).trim();
  const terms = query.split(/\s+/u).filter(Boolean).slice(0, 12);
  const requested = Array.isArray(options.sources) ? options.sources.filter(s => SOURCES.includes(s)) : SOURCES;
  const limit = clamp(options.limit, 30, LIMIT_MAX);
  const from = plain(options.from), to = plain(options.to);
  const found = [];
  for (const source of requested) {
    const rows = collections?.[source];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id) continue;
      const date = dateOf(row);
      if (from && (!date || date.slice(0, 10) < from)) continue;
      if (to && (!date || date.slice(0, 10) > to)) continue;
      const full = textOf(row);
      const haystack = norm(full);
      if (terms.length && !terms.every(term => haystack.includes(term))) continue;
      const score = terms.reduce((n, term) => n + (norm(plain(row.title)).includes(term) ? 3 : 1), 0);
      const first = terms.length ? haystack.indexOf(terms[0]) : 0;
      const start = Math.max(0, first - 65);
      found.push({source, id:String(row.id), date, title:plain(row.title || row.name), snippet:full.slice(start, start + TEXT_MAX), score});
    }
  }
  found.sort((a,b) => b.score-a.score || b.date.localeCompare(a.date) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  return {query:plain(options.query || ""),total:found.length,results:found.slice(0,limit),truncated:found.length>limit};
}

/**
 * Stable, read-only constellation graph. Each star maps to an existing record.
 * Links only express an explicit shared title phrase, never an inferred life event.
 */
export function buildLittlePhoneMemorySea(collections, options = {}) {
  const cap = clamp(options.limit, 120, 300);
  const records = [];
  for (const source of SOURCES) {
    const rows = collections?.[source];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id) continue;
      const text = textOf(row);
      if (!text.trim()) continue;
      records.push({key:source+":"+String(row.id),source,id:String(row.id),
        date:dateOf(row),title:plain(row.title || row.name) || text.slice(0,32),
        snippet:text.slice(0,TEXT_MAX)});
    }
  }
  records.sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const nodes = records.slice(0,cap);
  const edges = [];
  const keywords = nodes.map(n => new Set((norm(n.title).match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(x=>x.length>=3)));
  for(let i=0;i<nodes.length;i++) {
    for(let j=i+1;j<nodes.length;j++) {
      if(edges.length>=400) break;
      const shared=[...keywords[i]].filter(t=>keywords[j].has(t));
      if(shared.length) edges.push({from:nodes[i].key,to:nodes[j].key,reason:"shared_title",terms:shared.slice(0,3)});
    }
  }
  return {nodes,edges,total:records.length,truncated:records.length>cap};
}
