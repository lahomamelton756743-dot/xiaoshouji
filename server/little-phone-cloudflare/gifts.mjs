// Gift backend. Only public metadata leaves the server before unlock.
const MAX_HTML_BYTES = 1024 * 1024;
let ready;
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const iso=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const safeText=(v,n=200)=>String(v??"").slice(0,n);
const epoch=(v)=>{const n=Date.parse(v);return Number.isFinite(n)?n:NaN};
export async function ensureGifts(env){
 if(!ready){ready=(async()=>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS lp_gifts (
   id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
   preview_mode TEXT NOT NULL DEFAULT 'none', unlock_at TEXT,
   created_at TEXT NOT NULL, content_key TEXT, html_inline TEXT,
   content_type TEXT NOT NULL DEFAULT 'text/html', deleted INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_lp_gifts_created ON lp_gifts(created_at DESC)").run();
 })().catch(e=>{ready=null;throw e})}return ready;
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
 const {results=[]}=await env.DB.prepare("SELECT id,title,message,preview_mode,unlock_at,created_at FROM lp_gifts WHERE deleted=0 ORDER BY created_at DESC LIMIT 500").all();
 return respond({ok:true,gifts:results.map(metadata)});
}
export async function openGift(env,giftId){
 await ensureGifts(env);
 const r=await env.DB.prepare("SELECT * FROM lp_gifts WHERE id=? AND deleted=0").bind(giftId).first();
 if(!r)return respond({ok:false,error:"not_found"},404);
 if(!isOpen(r))return respond({ok:false,error:"gift_locked"},423);
 let html=r.html_inline;
 if(r.content_key){if(!env.LITTLEPHONE_GIFTS)return respond({ok:false,error:"gift_storage_unavailable"},503);
  const obj=await env.LITTLEPHONE_GIFTS.get(r.content_key);if(!obj)return respond({ok:false,error:"gift_content_missing"},404);
  html=await obj.text();
 }
 if(typeof html!=="string")return respond({ok:false,error:"gift_content_missing"},404);
 return respond({ok:true,id:r.id,html});
}
export async function createGift(env,body){
 await ensureGifts(env);
 const title=safeText(body.title,120).trim(),message=safeText(body.message,3000);
 const html=typeof body.html==="string"?body.html:"";
 if(!title||!html)return respond({ok:false,error:"title_and_html_required"},400);
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
  await env.DB.prepare("INSERT INTO lp_gifts(id,title,message,preview_mode,unlock_at,created_at,content_key,html_inline) VALUES(?,?,?,?,?,?,?,?)")
   .bind(giftId,title,message,mode,unlock,created,key,inline).run();
 }catch(e){if(key)await env.LITTLEPHONE_GIFTS.delete(key);throw e}
 return respond({ok:true,gift:metadata({id:giftId,title,message,preview_mode:mode,unlock_at:unlock,created_at:created})},201);
}
export async function deleteGift(env,giftId){
 await ensureGifts(env);
 const result=await env.DB.prepare("UPDATE lp_gifts SET deleted=1 WHERE id=? AND deleted=0").bind(giftId).run();
 return respond({ok:true,deleted:Number(result.meta?.changes||0)>0});
}
