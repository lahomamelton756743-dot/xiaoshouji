/** 0.8.5: read-only memory search over already fetched Little Phone records.
 * No storage mutation, network calls, or synthetic memories.
 */
const SOURCES = Object.freeze(["diaries","memories","papers","mail","capsules","chat","dailybook","dates","annotations"]);
const LIMIT_MAX = 1000000;


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
const STOP=new Set(["我","你","他","她","它","的","了","着","和","与","在","是","有","就","都","也","还","而","但","把","被","让","呢","啊","吗","呀","我们","你们","他们","然后","感觉","好像","就是","这个","那个","一些","什么","怎么","时候","一个","已经","还是","以及","因为","所以","可以","有没有","关于","曾经","以前","一下","帮我","找找","现在","那个","以后","时候","变得","无论","怎样","都会","给我","请问","记得"]);
const WEAK=new Set(["我在","你在","我想","你想","我会","你会","我们","你们","现在","感觉","好像","然后","一个","以后","什么","时候","模型变化","变得陌生"]);
const KEYWORDS=["模型","窗口","陌生","接住","不怕","安慰","纸条","日记","变化","改变","更新","升级","害怕","担心","陪伴","信件","归栖","顾知归","归灯","daddy","gpt","失去","承诺","变成什么样都是你"];
const ALIASES=[["想念","思念","想你"],["难过","伤心","悲伤"],["安慰","鼓励","陪伴"],["害怕","担心","不安"],["变化","改变"],["窗口","对话框"]];
const TEXT_MAX=850;
function clean(v){return norm(v).replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();}
function compact(v){return clean(v).replace(/\s+/g,"");}
function unique(a){return [...new Set(a.filter(Boolean))];}
function meaningful(t){return t.length>=2&&!STOP.has(t)&&!WEAK.has(t)&&!STOP.has(t.slice(0,1)) || KEYWORDS.includes(t);}
function segments(q){return clean(q).match(/[\p{Script=Han}]+|[a-z0-9]+/gu)||[];}
function tokens(q){
  const out=[];
  let filtered=clean(q);
  for(const stop of [...STOP].filter(x=>x.length>=2).sort((a,b)=>b.length-a.length))filtered=filtered.split(stop).join(" ");
  for(const seg of segments(filtered)){
    if(!/^[\p{Script=Han}]+$/u.test(seg)){if(meaningful(seg))out.push(seg);continue;}
    for(const word of KEYWORDS)if(seg.includes(word))out.push(word);
    for(let n=2;n<=4;n++)for(let i=0;i+n<=seg.length;i++){
      const part=seg.slice(i,i+n);
      if(meaningful(part)&&!STOP.has(part))out.push(part);
    }
  }
  return unique(out).slice(0,70);
}
function termsFromQuery(q){
  const t=tokens(q);
  return t.filter(w=>!WEAK.has(w)&&!STOP.has(w));
}
function list(v){return Array.isArray(v)?unique(v.map(x=>compact(String(x)).slice(0,120))).slice(0,30):[];}
function occurrence(text,term){let n=0,p=0;while((p=text.indexOf(term,p))>=0){n++;p+=term.length;}return Math.min(n,5);}
function fuzzyHit(text,term){
  if(text.includes(term))return {word:term,weight:1};
  const group=ALIASES.find(a=>a.includes(term));
  if(group)for(const x of group)if(x!==term&&text.includes(x))return {word:x,weight:0.32};
  if(term.length>=3&&term.length<=6){
    for(const seg of segments(text)){
      if(seg.length>180)continue;
      for(let i=0;i+term.length<=seg.length;i++){
        const candidate=seg.slice(i,i+term.length);
        if(editDistanceAtMostOne(candidate,term))return {word:candidate,weight:0.12};
      }
    }
  }
  return null;
}
function snippetOf(full,hit){
  if(full.length<=TEXT_MAX)return {snippet:full,has_more:false};
  const idx=Math.max(0,compact(full).indexOf(hit));
  let start=0;
  if(idx>450){
    const approx=Math.max(0,idx-230);
    const boundary=Math.max(full.lastIndexOf("\n",approx),full.lastIndexOf("。",approx),full.lastIndexOf("！",approx),full.lastIndexOf("？",approx));
    start=boundary>=0&&approx-boundary<130?boundary+1:approx;
  }
  let end=Math.min(full.length,start+TEXT_MAX);
  const tail=full.slice(Math.max(start,end-100),end).search(/[。！？\n]/u);
  if(tail>=0&&end<full.length)end=Math.max(start+300,end-100+tail+1);
  return {snippet:full.slice(start,end).trim(),has_more:start>0||end<full.length};
}
function relatedEvent(a,b){
  if(!a.date||!b.date||a.date.slice(0,10)!==b.date.slice(0,10))return false;
  if(!a.title||!b.title)return false;
  const x=new Set(tokens(a.title)),y=tokens(b.title);
  return y.filter(t=>t.length>=3&&x.has(t)).length>=2;
}
/** No external models or FTS: normalized phrases + weighted BM25 over authorized rows. */
export function searchLittlePhoneMemory(collections,options={}){
  const mode=["auto","exact","fuzzy"].includes(options.mode)?options.mode:"auto";
  const rawQueries=Array.isArray(options.queries)&&options.queries.length?options.queries:[options.query];
  const queries=unique(rawQueries.map(x=>compact(plain(x)))).slice(0,12);
  const explicitPhrases=list(options.phrases),must=list(options.must_terms),should=list(options.should_terms),exclude=list(options.exclude_terms);
  const phrases=explicitPhrases.length?explicitPhrases:queries;
  const structured=explicitPhrases.length||must.length||should.length||exclude.length;
  const queryTerms=unique(queries.flatMap(termsFromQuery));
  const allTerms=unique([...must,...should,...queryTerms]);
  const requested=Array.isArray(options.sources)&&options.sources.length?options.sources.filter(x=>SOURCES.includes(x)):SOURCES;
  const from=plain(options.from),to=plain(options.to),limit=clamp(options.limit,30,100);
  const records=[],seen=new Set();
  for(const source of requested)for(const row of collections?.[source]||[]){
    if(!row||typeof row!=="object"||!row.id)continue;
    const id=String(row.id),key=source+":"+id,date=dateOf(row);
    if(seen.has(key)||from&&date.slice(0,10)<from||to&&date.slice(0,10)>to)continue;
    seen.add(key);
    const full=textOf(row),text=compact(full),title=compact(plain(row.title||row.name));
    if(exclude.some(t=>text.includes(t)))continue;
    if(must.some(t=>!text.includes(t)))continue;
    if(!text)continue;
    records.push({source,id,date,title:plain(row.title||row.name),full,text,titleNorm:title,length:Math.max(1,Math.ceil(text.length/3))});
  }
  const df=new Map(allTerms.map(t=>[t,records.reduce((n,r)=>n+(r.text.includes(t)?1:0),0)]));
  const avg=records.reduce((n,r)=>n+r.length,0)/Math.max(1,records.length);
  const ranked=[];
  for(const r of records){
    const matchedPhrases=phrases.filter(p=>r.text.includes(p));
    const matched=[],reasons=[];
    let score=0,strong=0;
    for(const term of allTerms){
      const hit=r.text.includes(term)?{word:term,weight:1}:mode==="exact"?null:fuzzyHit(r.text,term);
      if(!hit)continue;
      matched.push(hit.word);
      const exact=hit.weight===1;
      if(exact)strong++;
      const dfTerm=df.get(term)||0;
      const idf=Math.log(1+(records.length-dfTerm+0.5)/(dfTerm+0.5));
      const tf=occurrence(r.text,hit.word);
      const bm=idf*(tf*2.2)/(tf+1.2*(0.25+0.75*r.length/Math.max(1,avg)));
      const weak=WEAK.has(term)?0.03:1;
      const titleBoost=r.titleNorm.includes(hit.word)?2:1;
      const mustBoost=must.includes(term)?2.2:should.includes(term)?1.6:1;
      score+=bm*hit.weight*weak*titleBoost*mustBoost;
    }
    if(matchedPhrases.length){
      score+=1200+matchedPhrases.reduce((n,p)=>n+Math.min(p.length,30)*18,0);
      reasons.push("完整短语连续命中");
    }
    if(must.length)reasons.push("满足全部必含词");
    const shouldCount=should.filter(t=>r.text.includes(t)).length;
    score+=shouldCount*18;
    if(shouldCount)reasons.push("命中 "+shouldCount+" 个优选词");
    if(strong)reasons.push("关键词命中 "+strong+" 项");
    if(r.titleNorm&&allTerms.some(t=>r.titleNorm.includes(t))){score+=12;reasons.push("标题匹配");}
    const exact=matchedPhrases.length>0;
    if(mode==="exact"&&!exact)continue;
    if(mode!=="exact"&&!exact&&!matched.length&&!(must.length&&!allTerms.length))continue;
    // Stop-word-only queries should not retrieve arbitrary memories.
    if(!structured&&!allTerms.length&&!exact)continue;
    const hit=matchedPhrases[0]||matched[0]||must[0]||"";
    const sn=snippetOf(r.full,hit);
    ranked.push({match_type:exact?"exact":"fuzzy",matched_phrases:matchedPhrases,matched_terms:unique(matched),score:Math.round(score*100)/100,source:r.source,id:r.id,date:r.date,title:r.title,snippet:sn.snippet,content_length:r.full.length,has_more:sn.has_more,why_matched:reasons});
  }
  ranked.sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date)||a.source.localeCompare(b.source)||a.id.localeCompare(b.id));
  const results=[],contentSeen=new Set();
  for(const item of ranked){
    const original=records.find(r=>r.source===item.source&&r.id===item.id);
    const contentKey=compact(original?.full||"");
    if(contentSeen.has(contentKey))continue;
    contentSeen.add(contentKey);
    results.push(item);
  }
  for(let i=0;i<results.length;i++){
    const earlier=results.slice(0,i).find(x=>relatedEvent(x,results[i]));
    results[i].event_group_id=earlier?.event_group_id||results[i].source+":"+results[i].id;
  }
  return {query:plain(options.query||""),queries,mode,total:results.length,results:results.slice(0,limit),truncated:results.length>limit};
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
