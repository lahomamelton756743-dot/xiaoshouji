from pathlib import Path
p=Path("android/app/src/main/assets/littlephone/index.html")
s=p.read_text()
s=s.replace('        <button class="settingsRow" data-settings-section="api-provider"><span><b>AI API 接入</b><small>预留模型服务配置，默认不启用</small></span><i>›</i></button>\n','')
s=s.replace("'api-provider':'AI API 接入',",'')
p.write_text(s)
print("Restored original desktop settings, preserved functional scripts:",len(s))
