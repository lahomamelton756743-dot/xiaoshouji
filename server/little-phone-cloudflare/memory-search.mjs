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
const STOP=new Set(["我","你","他","她","它","我们","你们","他们","然后","感觉","好像","就是","这个","那个","一些","什么","怎么","时候","一个","已经","还是","以及","因为","所以","可以","有没有","关于","曾经","以前","一下","帮我","找找"]);
function tokenize(q){
  const words=[];
  for(const chunk of (norm(q).match(/[\p{Script=Han}]+|[a-z0-9]+/gu)||[])){
    if(/^[\p{Script=Han}]+$/u.test(chunk)){
      for(let n=2;n<=4;n++)for(let i=0;i+n<=chunk.length;i++){
        const w=chunk.slice(i,i+n);
        if(!STOP.has(w)&&!STOP.has(chunk))words.push(w);
      }
      if(chunk.length<=4&&!STOP.has(chunk))words.push(chunk);
    }else if(!STOP.has(chunk))words.push(chunk);
  }
  return [...new Set(words)].slice(0,64);
}
function countOccurrences(text,term){
  let n=0,pos=0;
  while((pos=text.indexOf(term,pos))>=0){n++;pos+=term.length;}
  return n;
}
function relevantTokens(text){
  return tokenize(text).length||1;
}
function relatedEvent(a,b){
  if(!a.date||!b.date||a.date.slice(0,10)!==b.date.slice(0,10))return false;
  if(!a.title||!b.title)return false;
  const ta=new Set(tokenize(a.title));
  const tb=tokenize(b.title);
  return tb.filter(t=>t.length>=3&&ta.has(t)).length>=2;
}
/** Read-only hybrid search: phrase-first, weighted BM25, bounded output. */
export function searchLittlePhoneMemory(collections,options={}){
  const queries=(Array.isArray(options.queries)?options.queries:[options.query]).map(q=>norm(q).trim()).filter(Boolean).slice(0,12);
  const mode=["exact","fuzzy","auto"].includes(options.mode)?options.mode:"auto";
  const requested=Array.isArray(options.sources)?options.sources.filter(s=>SOURCES.includes(s)):SOURCES;
  const limit=clamp(options.limit,30,100),from=plain(options.from),to=plain(options.to);
  const records=[],seen=new Set();
  for(const source of requested)for(const row of collections?.[source]||[]){
    if(!row||typeof row!=="object"||!row.id)continue;
    const id=String(row.id),key=source+":"+id;
    if(seen.has(key))continue;
    const date=dateOf(row);
    if(from&&(!date||date.slice(0,10)<from))continue;
    if(to&&(!date||date.slice(0,10)>to))continue;
    seen.add(key);
    const full=textOf(row);
    records.push({source,id,date,title:plain(row.title||row.name),full,haystack:norm(full),length:relevantTokens(full)});
  }
  const allTerms=[...new Set(queries.flatMap(tokenize))];
  const df=new Map(allTerms.map(t=>[t,records.reduce((n,r)=>n+(r.haystack.includes(t)?1:0),0)]));
  const avg=records.reduce((n,r)=>n+r.length,0)/Math.max(1,records.length);
  const results=[];
  for(const r of records){
    const phrases=queries.filter(q=>r.haystack.includes(q));
    const matched=new Set();
    let score=0;
    for(const term of allTerms){
      let hit=r.haystack.includes(term)?term:"";
      if(!hit&&mode!=="exact")hit=fuzzyTermMatch(r.haystack,term);
      if(!hit)continue;
      matched.add(hit);
      const tf=countOccurrences(r.haystack,hit),idf=Math.log(1+(records.length-(df.get(term)||0)+0.5)/((df.get(term)||0)+0.5));
      score+=idf*(tf*2.2)/(tf+1.2*(0.25+0.75*r.length/Math.max(1,avg)))*(r.title.includes(hit)?2.5:1);
    }
    if(mode==="exact"&&!phrases.length)continue;
    if(mode!=="exact"&&!phrases.length&&!matched.size)continue;
    const exact=phrases.length>0;
    score+=exact?1000+phrases.reduce((n,q)=>n+q.length*10,0):0;
    const first=phrases[0]||[...matched][0]||"";
    const start=Math.max(0,r.haystack.indexOf(first)-65);
    results.push({match_type:exact?"exact":"fuzzy",matched_terms:[...new Set([...phrases,...matched])],score:Math.round(score*100)/100,source:r.source,id:r.id,date:r.date,title:r.title,snippet:r.full.slice(start,start+TEXT_MAX)});
  }
  results.sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date)||a.source.localeCompare(b.source)||a.id.localeCompare(b.id));
  const groups=[];
  for(const item of results){
    let group=groups.find(g=>relatedEvent(g.representative,item));
    if(!group){group={id:item.source+":"+item.id,representative:item};groups.push(group);}
    item.event_group_id=group.id;
  }
  return {query:plain(options.query||""),queries:queries.map(String),mode,total:results.length,results:results.slice(0,limit),truncated:results.length>limit};
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
