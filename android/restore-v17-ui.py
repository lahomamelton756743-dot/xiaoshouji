from pathlib import Path
import re
p=Path("android/app/src/main/assets/littlephone/index.html")
s=p.read_text()
s=s.replace('        <button class="settingsRow" data-settings-section="api-provider"><span><b>AI API 接入</b><small>预留模型服务配置，默认不启用</small></span><i>›</i></button>\n','')
a=s.index('/* Gift HTML is stored in persistent WebView IndexedDB')
b=s.index('async function loadGiftApp()',a)
s=s[:a]+s[b:]
a=s.index('async function loadGiftApp()')
b=s.index('\n',s.index('}',a))
# Remove offline metadata loading and restore online-only fetch.
s=s.replace("if(giftStore.loading)return;giftStore.loading=true;renderGiftApp();try{const cached=await giftLocalMetadata();if(cached.length){giftStore.items=cached;giftStore.loaded=true;renderGiftApp();}if(!state.conn.connected)return;","if(giftStore.loading||!state.conn.connected)return;giftStore.loading=true;renderGiftApp();try{")
s=re.sub(r"await giftLocalMetadataSave\([^;]*;",'',s)
a=s.index(" const open=e.target.closest('[data-gift-open]');")
b=s.index("\n });",a)
s=s[:a]+""" const open=e.target.closest('[data-gift-open]');if(open&&giftStore.selected&&giftPublic(giftStore.selected)){const g=giftStore.selected;try{const d=await nativeRequest('GET','/api/littlephone/gifts/'+encodeURIComponent(g.id)+'/open');if(!d||typeof d.html!=='string')throw Error('礼物内容暂不可用');const frame=$('#giftFrame');frame.srcdoc=d.html;giftStore.view='viewer';renderGiftApp();}catch(err){toast(err.message||'礼物打开失败');}}"""+s[b:]
s=s.replace("'api-provider':'AI API 接入',",'')
# Remove the settings API panel branch added after v17.
s=re.sub(r"if\(section==='api-provider'\)\{.*?return;\}",'',s,flags=re.S)
p.write_text(s)
print("restored desktop source",len(s))
