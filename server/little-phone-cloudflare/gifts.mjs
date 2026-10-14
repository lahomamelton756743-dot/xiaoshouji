// Gift backend. Only public metadata leaves the server before unlock.
const MAX_HTML_BYTES = 1024 * 1024;
const readyByDb=new WeakMap();
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const iso=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const safeText=(v,n=200)=>String(v??"").slice(0,n);
const epoch=(v)=>{const n=Date.parse(v);return Number.isFinite(n)?n:NaN};
export async function ensureGifts(env){
 let ready=readyByDb.get(env.DB);
 if(!ready){ready=(async()=>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS lp_gifts (
   id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
   preview_mode TEXT NOT NULL DEFAULT 'none', unlock_at TEXT,
   created_at TEXT NOT NULL, content_key TEXT, html_inline TEXT,
   content_type TEXT NOT NULL DEFAULT 'text/html', deleted INTEGER NOT NULL DEFAULT 0
  )`).run();
  for(const [col,ddl] of [["creator_note","TEXT NOT NULL DEFAULT ''"],["updated_at","TEXT"],["gift_state","TEXT NOT NULL DEFAULT 'published'"]]){try{await env.DB.prepare("ALTER TABLE lp_gifts ADD COLUMN "+col+" "+ddl).run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS lp_gift_versions (gift_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(gift_id,version))").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_lp_gifts_created ON lp_gifts(created_at DESC)").run();
 })().catch(e=>{readyByDb.delete(env.DB);throw e});readyByDb.set(env.DB,ready)}return ready;
}
const isOpen=(r)=>!r.unlock_at||epoch(r.unlock_at)<=Date.now();
function metadata(r){
 const open=isOpen(r),mode=open?"full":r.preview_mode;
 return {id:r.id,unlocked:open,status:open?"open":"locked",
  title:mode==="full"||mode==="title"||mode==="message"?r.title:undefined,
  message:mode==="full"||mode==="message"?r.message:undefined,
  created_at:mode==="none"&&!open?undefined:r.created_at,
  unlock_at:mode==="none"&&!open?undefined:r.unlock_at};
}
export async function listGifts(env){
 await ensureGifts(env);
 const {results=[]}=await env.DB.prepare("SELECT id,title,message,preview_mode,unlock_at,created_at FROM lp_gifts WHERE deleted=0 AND gift_state='published' ORDER BY created_at DESC LIMIT 500").all();
 return respond({ok:true,gifts:results.filter(r=>isOpen(r)||r.preview_mode!=="none").map(metadata)});
}
export async function openGift(env,giftId){
 await ensureGifts(env);
 const r=await env.DB.prepare("SELECT * FROM lp_gifts WHERE id=? AND deleted=0").bind(giftId).first();
 if(!r)return respond({ok:false,error:"not_found"},404);
 if(r.gift_state!=="published"||!isOpen(r))return respond({ok:false,error:"gift_locked"},423);
 let html=r.html_inline;
 if(r.content_key && html==null){if(!env.LITTLEPHONE_GIFTS)return respond({ok:false,error:"gift_storage_unavailable"},503);
  const obj=await env.LITTLEPHONE_GIFTS.get(r.content_key);if(!obj)return respond({ok:false,error:"gift_content_missing"},404);
  html=await obj.text();
 }
 if(typeof html!=="string")return respond({ok:false,error:"gift_content_missing"},404);
 return respond({ok:true,id:r.id,html});
}
export async function createGift(env,body){
 await ensureGifts(env);
 const title=safeText(body.title,120).trim(),message=safeText(body.message,3000);
 const creatorNote=safeText(body.creator_note,30000),giftState=body.gift_state==="draft"?"draft":"published";
 const html=typeof body.html==="string"?body.html:"";
 if(!title||(giftState==="published"&&!html))return respond({ok:false,error:"title_and_html_required"},400);
 const bytes=new TextEncoder().encode(html);
 if(bytes.byteLength>MAX_HTML_BYTES)return respond({ok:false,error:"html_too_large",limit_bytes:MAX_HTML_BYTES},413);
 const mode=["none","title","message","full"].includes(body.preview_mode)?body.preview_mode:"none";
 const unlock=body.unlock_at?String(body.unlock_at):null;
 if(unlock&&!Number.isFinite(epoch(unlock)))return respond({ok:false,error:"invalid_unlock_at"},400);
 const giftId=id(),created=iso();
 let key=null,inline=null;
 if(env.LITTLEPHONE_GIFTS){
  key="gifts/"+giftId+"/index.html";
  await env.LITTLEPHONE_GIFTS.put(key,bytes,{httpMetadata:{contentType:"text/html; charset=utf-8"}});
 }else inline=html;
 try{
  await env.DB.prepare("INSERT INTO lp_gifts(id,title,message,preview_mode,unlock_at,created_at,content_key,html_inline,creator_note,updated_at,gift_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .bind(giftId,title,message,mode,unlock,created,key,inline,creatorNote,created,giftState).run();
 }catch(e){if(key)await env.LITTLEPHONE_GIFTS.delete(key);throw e}
 return respond({ok:true,gift:metadata({id:giftId,title,message,preview_mode:mode,unlock_at:unlock,created_at:created})},201);
}
export async function deleteGift(env,giftId){
 await ensureGifts(env);
 const result=await env.DB.prepare("UPDATE lp_gifts SET deleted=1 WHERE id=? AND deleted=0").bind(giftId).run();
 return respond({ok:true,deleted:Number(result.meta?.changes||0)>0});
}

const ownFields="id,title,message,preview_mode,unlock_at,created_at,updated_at,creator_note,gift_state,deleted,content_key,html_inline";
async function fullGift(env,r){
 let html=r.html_inline;
 if(r.content_key && html==null){const obj=await env.LITTLEPHONE_GIFTS?.get(r.content_key);html=obj?await obj.text():null}
 return {...r,html,html_inline:undefined,content_key:undefined};
}
export async function creatorListGifts(env,trash=false){
 await ensureGifts(env);
 const {results=[]}=await env.DB.prepare("SELECT "+ownFields+" FROM lp_gifts WHERE deleted=? ORDER BY created_at DESC LIMIT 500").bind(trash?1:0).all();
 return respond({ok:true,gifts:results.map(r=>({...r,html_inline:undefined,content_key:undefined}))});
}
export async function creatorReadGift(env,giftId){
 await ensureGifts(env);
 const r=await env.DB.prepare("SELECT "+ownFields+" FROM lp_gifts WHERE id=?").bind(giftId).first();
 return r?respond({ok:true,gift:await fullGift(env,r)}):respond({ok:false,error:"not_found"},404);
}
export async function updateGift(env,body){
 await ensureGifts(env);
 const giftId=safeText(body.id,100);
 const old=await env.DB.prepare("SELECT "+ownFields+" FROM lp_gifts WHERE id=? AND deleted=0").bind(giftId).first();
 if(!old)return respond({ok:false,error:"not_found"},404);
 const prior=await fullGift(env,old),next={...prior};
 for(const k of ["title","message","creator_note","html","preview_mode","unlock_at","gift_state"]){
  if(Object.prototype.hasOwnProperty.call(body,k))next[k]=body[k];
 }
 next.title=safeText(next.title,120).trim();next.message=safeText(next.message,3000);
 next.creator_note=safeText(next.creator_note,30000);
 if(!next.title||typeof next.html!=="string"||(next.gift_state==="published"&&!next.html))return respond({ok:false,error:"title_and_html_required"},400);
 if(new TextEncoder().encode(next.html).byteLength>MAX_HTML_BYTES)return respond({ok:false,error:"html_too_large"},413);
 if(!["none","title","message","full"].includes(next.preview_mode))return respond({ok:false,error:"invalid_preview_mode"},400);
 if(!["draft","published"].includes(next.gift_state))return respond({ok:false,error:"invalid_gift_state"},400);
 if(next.unlock_at&&!Number.isFinite(epoch(next.unlock_at)))return respond({ok:false,error:"invalid_unlock_at"},400);
 const versionRow=await env.DB.prepare("SELECT COALESCE(MAX(version),0)+1 AS n FROM lp_gift_versions WHERE gift_id=?").bind(giftId).first();
 const version=versionRow.n,now=iso();
 if(typeof prior.html!=="string")return respond({ok:false,error:"gift_content_missing"},409);
 await env.DB.prepare("INSERT INTO lp_gift_versions(gift_id,version,snapshot,created_at) VALUES(?,?,?,?)").bind(giftId,version,JSON.stringify(prior),now).run();
 // Store revised HTML in D1 to avoid an R2 overwrite before the DB update commits.

 await env.DB.prepare("UPDATE lp_gifts SET title=?,message=?,creator_note=?,preview_mode=?,unlock_at=?,gift_state=?,updated_at=?,html_inline=?,content_key=NULL WHERE id=?")
  .bind(next.title,next.message,next.creator_note,next.preview_mode,next.unlock_at||null,next.gift_state,now,next.html,giftId).run();
 return respond({ok:true,id:giftId,version,updated_at:now});
}
export async function giftVersions(env,giftId){
 await ensureGifts(env);
 const {results=[]}=await env.DB.prepare("SELECT version,created_at FROM lp_gift_versions WHERE gift_id=? ORDER BY version DESC LIMIT 100").bind(giftId).all();
 return respond({ok:true,versions:results});
}
export async function restoreGiftVersion(env,giftId,version){
 await ensureGifts(env);
 const row=await env.DB.prepare("SELECT snapshot FROM lp_gift_versions WHERE gift_id=? AND version=?").bind(giftId,version).first();
 if(!row)return respond({ok:false,error:"version_not_found"},404);
 return updateGift(env,{...JSON.parse(row.snapshot),id:giftId});
}
export async function restoreGift(env,giftId){
 await ensureGifts(env);
 const result=await env.DB.prepare("UPDATE lp_gifts SET deleted=0 WHERE id=? AND deleted=1").bind(giftId).run();
 return respond({ok:true,restored:Number(result.meta?.changes||0)>0});
}
