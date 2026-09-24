package com.littlephone.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * v0.5 来访读取策略。
 * 权限可以长期授权，但设备状态只在 little_phone_visit 命令到达时读取一次。
 */
public final class LittlePhoneVisitPolicy {
    private static final String PREFS = "little_phone_visit_policy_v05";

    public static final String KEY_VISIT = "visit_enabled";
    public static final String KEY_DEVICE = "device_state";
    public static final String KEY_CALENDAR = "calendar";
    public static final String KEY_USAGE = "usage";
    public static final String KEY_LOCATION = "location";
    public static final String KEY_NOTIFICATIONS = "notifications";
    public static final String KEY_MEDIA = "media";

    private LittlePhoneVisitPolicy() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean enabled(Context ctx, String key) {
        SharedPreferences p = prefs(ctx);
        if (KEY_LOCATION.equals(key) || KEY_NOTIFICATIONS.equals(key)) {
            return p.getBoolean(key, false);
        }
        return p.getBoolean(key, true);
    }

    public static JSONObject asJson(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put(KEY_VISIT, enabled(ctx, KEY_VISIT));
            o.put(KEY_DEVICE, enabled(ctx, KEY_DEVICE));
            o.put(KEY_CALENDAR, enabled(ctx, KEY_CALENDAR));
            o.put(KEY_USAGE, enabled(ctx, KEY_USAGE));
            o.put(KEY_LOCATION, enabled(ctx, KEY_LOCATION));
            o.put(KEY_NOTIFICATIONS, enabled(ctx, KEY_NOTIFICATIONS));
            o.put(KEY_MEDIA, enabled(ctx, KEY_MEDIA));
            o.put("snapshot_ttl_minutes", 30);
            o.put("mode", "read_once_on_visit");
        } catch (Exception ignored) { }
        return o;
    }

    public static boolean set(Context ctx, String key, boolean value) {
        if (!isKnownKey(key)) return false;
        prefs(ctx).edit().putBoolean(key, value).apply();
        return true;
    }

    private static boolean isKnownKey(String key) {
        return KEY_VISIT.equals(key) || KEY_DEVICE.equals(key) || KEY_CALENDAR.equals(key)
                || KEY_USAGE.equals(key) || KEY_LOCATION.equals(key)
                || KEY_NOTIFICATIONS.equals(key) || KEY_MEDIA.equals(key);
    }

    /**
     * LifeState 仍是原生能力的统一采集器；这里只把用户允许的字段放进一次性快照。
     */
    public static JSONObject collectSnapshot(Context ctx) {
        JSONObject out = new JSONObject();
        try {
            if (!enabled(ctx, KEY_VISIT)) {
                out.put("ok", false);
                out.put("error", "visit_reading_disabled");
                return out;
            }

            JSONObject full = LifeState.collect(ctx);
            out.put("ok", true);
            out.put("device_id", full.optString("device_id", AppPrefs.device(ctx)));
            out.put("captured_at_ms", System.currentTimeMillis());
            out.put("captured_at_local", full.optString("updated_at_local", ""));
            out.put("policy", asJson(ctx));

            if (enabled(ctx, KEY_DEVICE)) {
                copy(full, out, "battery_percent", "charging", "charging_type", "battery_status",
                        "network_type", "screen_on", "local_time", "local_date", "timezone");
            }
            if (enabled(ctx, KEY_USAGE)) {
                copy(full, out, "screen_time_today_minutes", "unlock_count_today", "last_unlock_at", "top_apps_today");
            }
            if (enabled(ctx, KEY_CALENDAR)) {
                copy(full, out, "calendar_state");
            }
            if (enabled(ctx, KEY_MEDIA)) {
                copy(full, out, "media_state");
            }
            if (enabled(ctx, KEY_LOCATION)) {
                // v0.5 首版只暴露用户已在掌心窗里选择/保存的城市与天气，不主动拉取 GPS 坐标。
                copy(full, out, "city", "weather_note", "weather_state", "current_weather_location");
                out.put("location_mode", "saved_city_only");
            }
            if (enabled(ctx, KEY_NOTIFICATIONS)) {
                // 通知监听仍由原生层掌握；本版不把正文加入快照，避免意外泄露通知内容。
                out.put("notifications_available", true);
                out.put("notification_summary", "enabled_without_content");
            }
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("error", e.getMessage() == null ? "visit_snapshot_failed" : e.getMessage());
            } catch (Exception ignored) { }
        }
        return out;
    }

    private static void copy(JSONObject from, JSONObject to, String... keys) {
        for (String key : keys) {
            try {
                if (from.has(key)) to.put(key, from.opt(key));
            } catch (Exception ignored) { }
        }
    }
}
