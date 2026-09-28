# 小手机 v0.7.5

Base: v0.7.4. This release keeps the existing Cloudflare Worker + D1 + Xiaomi Health Bridge architecture and existing data.

## v0.7.5
- Front-end: paler, quieter stationery decoration; stronger transparent glass; Together script treatment.
- Status: removes the bottom GPT/user status cards.
- Xiaomi Health: displays sleep duration, score, steps, heart rate, and sleep/wake clock times when the bridge returns them.
- GPT memory: existing lp_memories CRUD remains available through MCP.
- GPT profile: explicit get_gpt_profile / set_gpt_profile tools for display name, avatar, identity color, and identity font.
- Backgrounds remain local to the Android app and are not uploaded to D1.

Deployment values:
- Worker: little-phone-backend
- D1: little-phone-v051
- versionName: 0.7.5
- versionCode: 70350
- APK: LittlePhone-v0.7.5.apk

Suggested commit:
`Build little-phone v0.7.5 from v0.7.4 frontend health memory profile fixes`
