# 小手机 v0.8.1

Base: v0.7.4. This release keeps the existing Cloudflare Worker + D1 + Xiaomi Health Bridge architecture and existing data.

## v0.7.6
- Home: compresses the Together header and uses a raster calligraphy asset so Android WebView shows an actual script word instead of a plain italic fallback.
- Home: keeps the right flower behind the relationship-day number; GPT pendant is anchored inside the listening card next to the GPT portrait.
- Diary: removes the separate cover completely. The Diary page itself is lined paper and opens directly on the newest entry.
- Diary: left-edge previous-page and right-edge next-page animations now turn in opposite physical directions.
- Status: Xiaomi Health is a larger dashboard with sleep duration, score, steps, heart rate, distance, calories, sleep time, wake time, progress bars and a light data-scale chart.
- Status: the GPT night window gets a dedicated footer nook and is no longer clipped behind the phone-status card.
- The GPT pen/bookmark remains a page-edge decoration on Diary; the original GPT asset colors are not altered.
- Front-end: paler, quieter stationery decoration; stronger transparent glass; Together script treatment.
- Status: removes the bottom GPT/user status cards.
- Xiaomi Health: displays sleep duration, score, steps, heart rate, and sleep/wake clock times when the bridge returns them.
- GPT memory: existing lp_memories CRUD remains available through MCP.
- GPT profile: explicit get_gpt_profile / set_gpt_profile tools for display name, avatar, identity color, and identity font.
- Backgrounds remain local to the Android app and are not uploaded to D1.

Deployment values:
- Worker: little-phone-backend
- D1: little-phone-v051
- versionName: 0.8.1
- versionCode: 70361
- APK: LittlePhone-v0.8.1.apk

Suggested commit:
`Build little-phone v0.7.6 diary health and GPT decoration rework`


### v0.7.6 device hotfix
- Restored v0.7.5 paper-box full-list interaction and v0.7.5 mailbox behavior.
- Fixed local backgrounds so they sit behind every page instead of only peeking out below Settings.
- Ice-blue / pearl-white / faint pink-lilac liquid glass; green cast removed.
- Previous diary turn is now a distinct incoming-left animation, opposite the next-page turn.
- GPT-memory tools remain backed by lp_memories; ChatGPT plugin release is refreshed separately so the tools are discoverable.
