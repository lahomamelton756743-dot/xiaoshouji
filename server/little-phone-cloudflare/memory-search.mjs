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

function editDistanceAtMostOne(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,errors=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++errors>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return errors+(i<a.length||j<b.length?1:0)<=1;
}
const SYNONYMS=[["难过","伤心","悲伤","失落","委屈"],["安慰","陪伴","支持","鼓励"],["想念","思念","想你","惦记"],["害怕","担心","恐惧","不安"],["开心","快乐","高兴","幸福"],["分别","离开","告别","分离"]];
function variants(term){
  const group=SYNONYMS.find(g=>g.includes(term));
  return group||[term];
}
function fuzzyTermMatch(text,term){
  const alternatives=variants(term);
  for(const word of alternatives)if(text.includes(word))return word;
  if(term.length<3)return "";
  const words=text.match(/[\p{L}\p{N}]+/gu)||[];
  for(const word of words){
    if(word.length>=term.length-1&&word.length<=term.length+1&&editDistanceAtMostOne(word,term))return word;
    if(word.length>term.length)for(let i=0;i<=word.length-term.length;i++)
      if(editDistanceAtMostOne(word.slice(i,i+term.length),term))return word.slice(i,i+term.length);
  }
  return "";
}
/** Search all authorized records; return bounded ranked matches, never mutate data. */
export function searchLittlePhoneMemory(collections,options={}){
  const query=norm(options.query).trim();
  const mode=["exact","fuzzy","auto"].includes(options.mode)?options.mode:"auto";
  const terms=query.split(/\s+/u).filter(Boolean).slice(0,12);
  const requested=Array.isArray(options.sources)?options.sources.filter(s=>SOURCES.includes(s)):SOURCES;
  const limit=clamp(options.limit,30,100);
  const from=plain(options.from),to=plain(options.to);
  const exact=[],fuzzy=[];
  for(const source of requested){
    const rows=collections?.[source];
    if(!Array.isArray(rows))continue;
    for(const row of rows){
      if(!row||typeof row!=="object"||!row.id)continue;
      const date=dateOf(row);
      if(from&&(!date||date.slice(0,10)<from))continue;
      if(to&&(!date||date.slice(0,10)>to))continue;
      const full=textOf(row),haystack=norm(full);
      const isExact=!query||haystack.includes(query);
      const matchedTerms=terms.map(term=>haystack.includes(term)?term:fuzzyTermMatch(haystack,term)).filter(Boolean);
      if(query&&!isExact&&(mode==="exact"||!matchedTerms.length))continue;
      if(mode==="exact"&&!isExact)continue;
      const match_type=isExact?"exact":"fuzzy";
      const score=(isExact?100:0)+matchedTerms.reduce((n,term)=>n+(norm(plain(row.title)).includes(term)?3:1),0);
      const first=matchedTerms.length?haystack.indexOf(matchedTerms[0]):0;
      const start=Math.max(0,first-65);
      const item={match_type,matched_terms:[...new Set(matchedTerms)],score,source,id:String(row.id),date,title:plain(row.title||row.name),snippet:full.slice(start,start+TEXT_MAX)};
      (isExact?exact:fuzzy).push(item);
    }
  }
  const sort=(a,b)=>b.score-a.score||b.date.localeCompare(a.date)||a.source.localeCompare(b.source)||a.id.localeCompare(b.id);
  exact.sort(sort);fuzzy.sort(sort);
  const results=mode==="exact"?exact:mode==="fuzzy"?[...exact,...fuzzy].sort(sort):[...exact,...fuzzy];
  return {query:plain(options.query||""),mode,total:results.length,results:results.slice(0,limit),truncated:results.length>limit};
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
