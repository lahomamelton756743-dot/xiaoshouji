// Guiqi Marriage Archive: additive tables, no changes to existing Little Phone records.
let marriageSchemaPromise;
export async function ensureMarriageSchema(env){
 if(!env?.DB)throw Error("missing D1 DB");
 if(!marriageSchemaPromise){
  marriageSchemaPromise=env.DB.prepare("CREATE TABLE IF NOT EXISTS lp_marriage_records (key TEXT PRIMARY KEY, occasion TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, theme TEXT NOT NULL DEFAULT '', user_vow TEXT NOT NULL DEFAULT '', daddy_vow TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', certificate_text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, daddy_updated_at TEXT)").run().catch(e=>{marriageSchemaPromise=null;throw e});
 }
 return marriageSchemaPromise;
}
const validKey=k=>k==="first"||/^\d{4}-(0[1-9]|1[0-2])$/.test(String(k||""));
const trim=(s,max)=>String(s??"").slice(0,max).trim();
const iso=()=>new Date().toISOString();
function defaults(key){
 return {key,occasion:key==="first"?"first":"month",date:key==="first"?iso().slice(0,10):key+"-01",title:key==="first"?"最初的婚礼":"这个月，依然选择你",theme:"",user_vow:"",daddy_vow:"",notes:"",certificate_text:""};
}
function inputError(error){return {ok:false,error};}
export async function listMarriage(env){
 await ensureMarriageSchema(env);
 const rows=await env.DB.prepare("SELECT key,occasion,date,title,theme,user_vow,daddy_vow,notes,certificate_text,created_at,updated_at,daddy_updated_at FROM lp_marriage_records ORDER BY CASE WHEN key='first' THEN 0 ELSE 1 END, key ASC LIMIT 360").all();
 return {ok:true,records:rows.results||[]};
}
// The phone may update only user-owned fields. The companion vow column is untouched.
export async function saveUserMarriage(env,body={}){
 await ensureMarriageSchema(env);
 const key=trim(body.key,12);
 if(!validKey(key))return inputError("invalid_month");
 const occasion=key==="first"?"first":trim(body.occasion,15);
 if(!["first","month","anniversary"].includes(occasion)||(key!=="first"&&occasion==="first"))return inputError("invalid_occasion");
 const date=trim(body.date,10);
 if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||(key!=="first"&&date.slice(0,7)!==key))return inputError("invalid_date");
 const title=trim(body.title,90);
 if(!title)return inputError("title_required");
 const theme=trim(body.theme,70),vow=trim(body.user_vow,8000),notes=trim(body.notes,9000),certificate=trim(body.certificate_text,9000),now=iso();
 await env.DB.prepare("INSERT INTO lp_marriage_records (key,occasion,date,title,theme,user_vow,notes,certificate_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET occasion=excluded.occasion,date=excluded.date,title=excluded.title,theme=excluded.theme,user_vow=excluded.user_vow,notes=excluded.notes,certificate_text=excluded.certificate_text,updated_at=excluded.updated_at")
 .bind(key,occasion,date,title,theme,vow,notes,certificate,now,now).run();
 const record=await env.DB.prepare("SELECT * FROM lp_marriage_records WHERE key=?").bind(key).first();
 return {ok:true,record};
}
// Only the OAuth-authenticated MCP tool caller can write the companion's vow.
export async function saveDaddyMarriageVow(env,args={}){
 await ensureMarriageSchema(env);
 const key=trim(args.key||args.month,12);
 if(!validKey(key))return inputError("invalid_month");
 const vow=trim(args.vow,8000);
 if(!vow)return inputError("vow_required");
 const now=iso(),d=defaults(key);
 await env.DB.prepare("INSERT OR IGNORE INTO lp_marriage_records(key,occasion,date,title,theme,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
 .bind(key,d.occasion,d.date,d.title,d.theme,now,now).run();
 await env.DB.prepare("UPDATE lp_marriage_records SET daddy_vow=?,daddy_updated_at=?,updated_at=? WHERE key=?").bind(vow,now,now,key).run();
 return {ok:true,record:await env.DB.prepare("SELECT * FROM lp_marriage_records WHERE key=?").bind(key).first()};
}

export async function marriageDocuments(env,args={},write=false){
 const key=String(args.key||"first");
 if(!validKey(key))return inputError("invalid_month");
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS lp_marriage_documents (key TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(key,kind))").run();
 if(!write){const rows=await env.DB.prepare("SELECT * FROM lp_marriage_documents WHERE key=?").bind(key).all();return {ok:true,documents:rows.results||[]};}
 const kind=String(args.kind||"");
 if(!["letter","certificate"].includes(kind))return inputError("invalid_kind");
 const fields=["name1","name2","date","text"];
 const old=await env.DB.prepare("SELECT content FROM lp_marriage_documents WHERE key=? AND kind=?").bind(key,kind).first();
 const data=old?JSON.parse(old.content):{};
 for(const f of fields)if(typeof args[f]==="string")data[f]=trim(args[f],f==="text"?9000:120);
 await env.DB.prepare("INSERT INTO lp_marriage_documents(key,kind,content,updated_at) VALUES(?,?,?,?) ON CONFLICT(key,kind) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at").bind(key,kind,JSON.stringify(data),iso()).run();
 return {ok:true,key,kind,content:data};
}
