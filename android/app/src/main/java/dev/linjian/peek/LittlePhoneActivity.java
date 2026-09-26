package com.littlephone.app;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationManager;
import android.location.LocationListener;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/**
 * 小手机 v0.7.1 Web/PWA 外壳。
 *
 * 视觉层使用本地 HTML/CSS/JS；设备能力和现有掌心窗模块继续由 Android 原生层提供。
 * Web 层只能通过这个 Activity 暴露的受控 bridge 访问本机状态和自建 server。
 */
public class LittlePhoneActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 9040;
    private static final int LOCATION_PERMISSION_REQUEST = 9041;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 9042;
    private static final int AVATAR_PICK_REQUEST = 9043;
    private String avatarPickWho = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(237, 246, 255));
        getWindow().setNavigationBarColor(Color.rgb(247, 244, 251));
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(238, 247, 255));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.addJavascriptInterface(new NativeBridge(), "LittlePhoneNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("file".equalsIgnoreCase(scheme) || "about".equalsIgnoreCase(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (LittlePhoneActivity.this.filePathCallback != null) {
                    LittlePhoneActivity.this.filePathCallback.onReceiveValue(null);
                }
                LittlePhoneActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    LittlePhoneActivity.this.filePathCallback = null;
                    Toast.makeText(LittlePhoneActivity.this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/littlephone/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (hasLocationPermission()) {
            refreshWeatherFromBestLocation();
        }
        if (webView != null) webView.evaluateJavascript("window.LittlePhone && window.LittlePhone.refreshNative && window.LittlePhone.refreshNative();", null);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(window.LittlePhone&&window.LittlePhone.handleBack)?String(window.LittlePhone.handleBack()):'false'", value -> {
            boolean handled = value != null && value.replace("\"", "").contains("true");
            if (handled) return;
            if (webView.canGoBack()) webView.goBack();
            else LittlePhoneActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            return;
        }
        if (requestCode == AVATAR_PICK_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                final Uri uri = data.getData();
                final String who = avatarPickWho == null || avatarPickWho.isEmpty() ? "ryan" : avatarPickWho;
                avatarPickWho = "";
                new Thread(() -> saveAvatarFromUri(who, uri), "littlephone-avatar").start();
            } else {
                avatarPickWho = "";
            }
        }
    }

    private void saveAvatarFromUri(String who, Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream probe = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(probe, null, bounds); }
            int sample = 1;
            int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
            while (maxDim / sample > 1600) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = Math.max(1, sample);
            Bitmap src;
            try (InputStream in = getContentResolver().openInputStream(uri)) { src = BitmapFactory.decodeStream(in, null, opts); }
            if (src == null) throw new IllegalStateException("image_decode_failed");
            int side = Math.min(src.getWidth(), src.getHeight());
            int left = Math.max(0, (src.getWidth() - side) / 2);
            int top = Math.max(0, (src.getHeight() - side) / 2);
            Bitmap out = Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            canvas.drawBitmap(src, new Rect(left, top, left + side, top + side), new Rect(0, 0, 320, 320), paint);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            out.compress(Bitmap.CompressFormat.JPEG, 82, bytes);
            String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            String keyAvatar = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_AVATAR : AppPrefs.KEY_USER_AVATAR;
            AppPrefs.get(this).edit().putString(keyAvatar, dataUrl).apply();
            src.recycle();
            out.recycle();
            runOnUiThread(() -> {
                emit("littlephone-profile-changed", new NativeBridge().getProfile());
                Toast.makeText(this, "头像已经换好", Toast.LENGTH_SHORT).show();
            });
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "头像没有换成功，请换一张照片再试", Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            refreshWeatherFromBestLocation();
        }
        emit("littlephone-permission-changed", "{}");
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void refreshWeatherFromBestLocation() {
        if (!hasLocationPermission()) {
            if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_PERMISSION_REQUEST);
            return;
        }
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        Location best = null;
        if (lm != null) {
            try { best = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) { }
            try {
                Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (gps != null && (best == null || gps.getTime() > best.getTime())) best = gps;
            } catch (Exception ignored) { }
        }
        if (best != null) {
            refreshWeatherForLocation(best);
            return;
        }
        if (lm == null) { refreshWeatherFromSavedCity(); return; }
        try {
            String provider = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER
                    : (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : "");
            if (provider.isEmpty()) { refreshWeatherFromSavedCity(); return; }
            final boolean[] delivered = {false};
            LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    if (delivered[0]) return;
                    delivered[0] = true;
                    refreshWeatherForLocation(location);
                }
                @Override public void onProviderEnabled(String provider) { }
                @Override public void onProviderDisabled(String provider) { }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
            };
            lm.requestSingleUpdate(provider, listener, Looper.getMainLooper());
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (!delivered[0]) {
                    delivered[0] = true;
                    try { lm.removeUpdates(listener); } catch (Exception ignored) { }
                    refreshWeatherFromSavedCity();
                }
            }, 9000);
        } catch (Exception e) { refreshWeatherFromSavedCity(); }
    }

    private void refreshWeatherForLocation(Location location) {
        if (location == null) { refreshWeatherFromSavedCity(); return; }
        new Thread(() -> {
            String city = AppPrefs.get(LittlePhoneActivity.this).getString(AppPrefs.KEY_CITY, "");
            try {
                Geocoder geocoder = new Geocoder(LittlePhoneActivity.this, Locale.CHINA);
                List<Address> list = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
                if (list != null && !list.isEmpty()) {
                    Address a = list.get(0);
                    String resolved = a.getLocality();
                    if (TextUtils.isEmpty(resolved)) resolved = a.getSubAdminArea();
                    if (TextUtils.isEmpty(resolved)) resolved = a.getAdminArea();
                    if (!TextUtils.isEmpty(resolved)) city = resolved.replace("市", "").trim();
                }
            } catch (Exception ignored) { }
            final String label = TextUtils.isEmpty(city) ? "当前位置" : city.trim();
            AppPrefs.get(LittlePhoneActivity.this).edit().putString(AppPrefs.KEY_CITY, label).apply();
            WeatherLive.refreshCoordinatesAsync(LittlePhoneActivity.this, location.getLatitude(), location.getLongitude(), label, result -> handleWeatherResult(label, result));
        }, "littlephone-weather-location").start();
    }

    private void refreshWeatherFromSavedCity() {
        String city = AppPrefs.get(this).getString(AppPrefs.KEY_CITY, "").trim();
        if (city.isEmpty() || "当前位置".equals(city)) {
            try { emit("littlephone-weather-updated", new JSONObject().put("ok", false).put("error", "location_unavailable").toString()); } catch (Exception ignored) { }
            return;
        }
        final String chosen = city;
        WeatherLive.refreshAsync(this, chosen, result -> handleWeatherResult(chosen, result));
    }

    private void handleWeatherResult(String city, JSONObject result) {
        try {
            if (result != null && result.optBoolean("ok", false)) {
                String note = result.optString("condition", "天气") + " " + result.optInt("temperature", 0) + "℃";
                AppPrefs.get(LittlePhoneActivity.this).edit().putString(AppPrefs.KEY_CITY, city).putString(AppPrefs.KEY_WEATHER_NOTE, note).apply();
                emit("littlephone-weather-updated", new JSONObject().put("ok", true).put("city", city).put("note", note).toString());
            } else {
                emit("littlephone-weather-updated", result == null ? "{\"ok\":false,\"error\":\"weather_failed\"}" : result.toString());
            }
        } catch (Exception ignored) { }
    }

    private void emit(String event, String payloadJson) {
        if (webView == null) return;
        String payload = payloadJson == null ? "null" : payloadJson;
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event) + ", {detail:" + payload + "}));", null));
    }

    private String readAll(InputStream stream) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) out.append(line).append('\n');
        return out.toString().trim();
    }

    public final class NativeBridge {
        @JavascriptInterface
        public String getDeviceState() {
            try {
                JSONObject state = LifeState.collect(LittlePhoneActivity.this);
                state.put("user_name", AppPrefs.userName(LittlePhoneActivity.this));
                state.put("companion_name", AppPrefs.companionName(LittlePhoneActivity.this));
                return state.toString();
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":" + JSONObject.quote(e.getMessage() == null ? "native_error" : e.getMessage()) + "}";
            }
        }

        @JavascriptInterface
        public String getVisitPolicy() {
            return LittlePhoneVisitPolicy.asJson(LittlePhoneActivity.this).toString();
        }

        @JavascriptInterface
        public boolean setVisitPolicy(String key, boolean value) {
            return LittlePhoneVisitPolicy.set(LittlePhoneActivity.this, key, value);
        }

        @JavascriptInterface
        public String previewVisitSnapshot() {
            // 仅供本机“权限预览”页使用，不上传 server，也不生成来访留痕。
            return LittlePhoneVisitPolicy.collectSnapshot(LittlePhoneActivity.this).toString();
        }

        @JavascriptInterface
        public String getConnectionState() {
            try {
                JSONObject o = new JSONObject();
                String server = AppPrefs.server(LittlePhoneActivity.this);
                String token = AppPrefs.token(LittlePhoneActivity.this);
                o.put("connected", !server.isEmpty() && !token.isEmpty());
                o.put("server", server);
                o.put("device_id", AppPrefs.device(LittlePhoneActivity.this));
                o.put("user_name", AppPrefs.userName(LittlePhoneActivity.this));
                o.put("companion_name", AppPrefs.companionName(LittlePhoneActivity.this));
                return o.toString();
            } catch (Exception e) {
                return "{\"connected\":false}";
            }
        }

        @JavascriptInterface
        public void openConnectionSettings() {
            runOnUiThread(() -> ConnectionSettings.show(LittlePhoneActivity.this,
                    () -> emit("littlephone-connection-changed", getConnectionState())));
        }

        @JavascriptInterface
        public void openNativeSettings() {
            // v0.6.1：权限入口留在“小手机”里，不再跳回旧掌心窗主页。
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openUsageSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
                catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public String getProfile() {
            try {
                JSONObject o = new JSONObject();
                o.put("ryan_name", AppPrefs.userName(LittlePhoneActivity.this));
                o.put("daddy_name", AppPrefs.companionName(LittlePhoneActivity.this));
                o.put("ryan_avatar", AppPrefs.get(LittlePhoneActivity.this).getString(AppPrefs.KEY_USER_AVATAR, ""));
                o.put("daddy_avatar", AppPrefs.get(LittlePhoneActivity.this).getString(AppPrefs.KEY_COMPANION_AVATAR, ""));
                o.put("ryan_color", AppPrefs.userIdentityColor(LittlePhoneActivity.this));
                o.put("daddy_color", AppPrefs.companionIdentityColor(LittlePhoneActivity.this));
                o.put("ryan_font", AppPrefs.userIdentityFont(LittlePhoneActivity.this));
                o.put("daddy_font", AppPrefs.companionIdentityFont(LittlePhoneActivity.this));
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public boolean saveProfile(String who, String name, String avatarDataUrl) {
            try {
                String keyName = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_NAME : AppPrefs.KEY_USER_NAME;
                String keyAvatar = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_AVATAR : AppPrefs.KEY_USER_AVATAR;
                android.content.SharedPreferences.Editor ed = AppPrefs.get(LittlePhoneActivity.this).edit();
                if (name != null && !name.trim().isEmpty()) ed.putString(keyName, name.trim().substring(0, Math.min(40, name.trim().length())));
                if (avatarDataUrl != null) {
                    if (avatarDataUrl.length() <= 450000) ed.putString(keyAvatar, avatarDataUrl);
                    else return false;
                }
                ed.apply();
                emit("littlephone-profile-changed", getProfile());
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean saveProfileV2(String who, String name, String avatarDataUrl, String identityColor) {
            if (!saveProfile(who, name, avatarDataUrl)) return false;
            try {
                String keyColor = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_IDENTITY_COLOR : AppPrefs.KEY_USER_IDENTITY_COLOR;
                String color = identityColor == null ? "" : identityColor.trim();
                if (!color.matches("^#[0-9A-Fa-f]{6}$")) return false;
                AppPrefs.get(LittlePhoneActivity.this).edit().putString(keyColor, color.toUpperCase(java.util.Locale.ROOT)).apply();
                emit("littlephone-profile-changed", getProfile());
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean saveProfileV3(String who, String name, String avatarDataUrl, String identityColor, String identityFont) {
            if (!saveProfileV2(who, name, avatarDataUrl, identityColor)) return false;
            try {
                String font = identityFont == null ? "" : identityFont.trim().toLowerCase(java.util.Locale.ROOT);
                if (!("clean".equals(font) || "rounded".equals(font) || "cheese".equals(font) || "italic".equals(font) || "serif".equals(font) || "kai".equals(font) || "mono".equals(font))) return false;
                String key = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_IDENTITY_FONT : AppPrefs.KEY_USER_IDENTITY_FONT;
                AppPrefs.get(LittlePhoneActivity.this).edit().putString(key, font).apply();
                emit("littlephone-profile-changed", getProfile());
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean saveIdentityColor(String who, String color) {
            try {
                String value = color == null ? "" : color.trim();
                if (!value.matches("#[0-9A-Fa-f]{6}")) return false;
                String key = "daddy".equalsIgnoreCase(who) ? AppPrefs.KEY_COMPANION_IDENTITY_COLOR : AppPrefs.KEY_USER_IDENTITY_COLOR;
                AppPrefs.get(LittlePhoneActivity.this).edit().putString(key, value.toUpperCase(java.util.Locale.ROOT)).apply();
                emit("littlephone-profile-changed", getProfile());
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void pickAvatar(String who) {
            avatarPickWho = "daddy".equalsIgnoreCase(who) ? "daddy" : "ryan";
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("image/*");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(i, AVATAR_PICK_REQUEST);
                } catch (Exception e) {
                    Toast.makeText(LittlePhoneActivity.this, "没有可用的相册选择器", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String getLocalData(String key) {
            if (key == null || key.trim().isEmpty()) return "";
            return LittlePhoneLocalStore.get(LittlePhoneActivity.this).getJson("web_" + key.trim());
        }

        @JavascriptInterface
        public boolean setLocalData(String key, String raw) {
            if (key == null || key.trim().isEmpty() || raw == null || raw.length() > 3000000) return false;
            return LittlePhoneLocalStore.get(LittlePhoneActivity.this).putJson("web_" + key.trim(), raw);
        }

        @JavascriptInterface
        public String getPermissionStatus() {
            try {
                JSONObject o = new JSONObject();
                o.put("location", hasLocationPermission());
                o.put("usage", LifeState.hasUsagePermission(LittlePhoneActivity.this));
                o.put("overlay", Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(LittlePhoneActivity.this));
                o.put("accessibility", ScreenshotService.ready());
                if (Build.VERSION.SDK_INT >= 33) o.put("notifications", checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
                else o.put("notifications", true);
                String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                o.put("notification_listener", enabled != null && enabled.contains(getPackageName()));
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public void requestCapability(String key) {
            runOnUiThread(() -> {
                try {
                    if ("location".equals(key)) {
                        if (!hasLocationPermission() && Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_PERMISSION_REQUEST);
                        else refreshWeatherFromBestLocation();
                    } else if ("usage".equals(key)) {
                        startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
                    } else if ("notifications".equals(key)) {
                        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                        startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
                    } else if ("overlay".equals(key)) {
                        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())); startActivity(i);
                    } else if ("accessibility".equals(key)) {
                        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                    }
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void refreshWeather() { runOnUiThread(() -> refreshWeatherFromBestLocation()); }

        @JavascriptInterface
        public String getLocalCache() { return LittlePhoneLocalStore.get(LittlePhoneActivity.this).getJson("remote_state"); }

        @JavascriptInterface
        public boolean setLocalCache(String raw) {
            if (raw == null || raw.length() > 6000000) return false;
            return LittlePhoneLocalStore.get(LittlePhoneActivity.this).putJson("remote_state", raw);
        }

        @JavascriptInterface
        public String getReminderConfig() { return ActiveReminder.config(LittlePhoneActivity.this).toString(); }

        @JavascriptInterface
        public boolean setReminderConfig(String raw) {
            try {
                JSONObject o = new JSONObject(raw == null ? "{}" : raw);
                android.content.SharedPreferences.Editor e = AppPrefs.get(LittlePhoneActivity.this).edit();
                if (o.has("active_reminders_enabled")) e.putBoolean(AppPrefs.KEY_ACTIVE_REMINDERS, o.optBoolean("active_reminders_enabled"));
                if (o.has("low_battery_enabled")) e.putBoolean(AppPrefs.KEY_RULE_BATTERY, o.optBoolean("low_battery_enabled"));
                if (o.has("low_battery_threshold")) e.putInt(AppPrefs.KEY_BATTERY_THRESHOLD, Math.max(5, Math.min(80, o.optInt("low_battery_threshold",20))));
                if (o.has("charge_full_enabled")) e.putBoolean(AppPrefs.KEY_RULE_CHARGE_FULL, o.optBoolean("charge_full_enabled"));
                if (o.has("charge_full_threshold")) e.putInt(AppPrefs.KEY_CHARGE_FULL_THRESHOLD, Math.max(80, Math.min(100, o.optInt("charge_full_threshold",95))));
                if (o.has("screen_time_enabled")) e.putBoolean(AppPrefs.KEY_RULE_SCREEN, o.optBoolean("screen_time_enabled"));
                if (o.has("screen_time_threshold_minutes")) e.putInt(AppPrefs.KEY_SCREEN_THRESHOLD_MIN, Math.max(30, Math.min(1440, o.optInt("screen_time_threshold_minutes",240))));
                if (o.has("water_enabled")) e.putBoolean(AppPrefs.KEY_RULE_WATER, o.optBoolean("water_enabled"));
                if (o.has("water_interval_minutes")) e.putInt(AppPrefs.KEY_WATER_INTERVAL_MIN, Math.max(30, Math.min(720, o.optInt("water_interval_minutes",120))));
                if (o.has("water_message")) e.putString(AppPrefs.KEY_WATER_MESSAGE, o.optString("water_message", AppPrefs.DEFAULT_WATER_MESSAGE));
                if (o.has("rest_enabled")) e.putBoolean(AppPrefs.KEY_RULE_REST, o.optBoolean("rest_enabled"));
                if (o.has("rest_interval_minutes")) e.putInt(AppPrefs.KEY_REST_INTERVAL_MIN, Math.max(30, Math.min(720, o.optInt("rest_interval_minutes",90))));
                if (o.has("rest_message")) e.putString(AppPrefs.KEY_REST_MESSAGE, o.optString("rest_message", AppPrefs.DEFAULT_REST_MESSAGE));
                e.apply(); return true;
            } catch (Exception ex) { return false; }
        }

        @JavascriptInterface
        public String getGuidianConfig() { return GuidianState.config(LittlePhoneActivity.this).toString(); }

        @JavascriptInterface
        public boolean setGuidianConfig(String raw) {
            try {
                JSONObject o = new JSONObject(raw == null ? "{}" : raw);
                android.content.SharedPreferences.Editor e = GuidianState.prefs(LittlePhoneActivity.this).edit();
                if (o.has("enabled")) e.putBoolean(GuidianState.KEY_ENABLED, o.optBoolean("enabled", true));
                if (o.has("allow_remote")) e.putBoolean(GuidianState.KEY_ALLOW_REMOTE, o.optBoolean("allow_remote", true));
                if (o.has("fullscreen")) e.putBoolean(GuidianState.KEY_FULLSCREEN, o.optBoolean("fullscreen", true));
                if (o.has("interval_minutes")) e.putInt(GuidianState.KEY_INTERVAL_MIN, Math.max(15, Math.min(10080, o.optInt("interval_minutes",180))));
                if (o.has("cooldown_minutes")) e.putInt(GuidianState.KEY_COOLDOWN_MIN, Math.max(0, Math.min(10080, o.optInt("cooldown_minutes",60))));
                if (o.has("daily_max")) e.putInt(GuidianState.KEY_DAILY_MAX, Math.max(0, Math.min(99, o.optInt("daily_max",3))));
                if (o.has("quiet_enabled")) e.putBoolean(GuidianState.KEY_QUIET_ENABLED, o.optBoolean("quiet_enabled", true));
                if (o.has("quiet_start")) e.putString(GuidianState.KEY_QUIET_START, o.optString("quiet_start", "23:30"));
                if (o.has("quiet_end")) e.putString(GuidianState.KEY_QUIET_END, o.optString("quiet_end", "08:00"));
                if (o.has("target_package")) { String pkg=o.optString("target_package","").trim(); if(pkg.isEmpty()||AppPrefs.isPackageLike(pkg)) e.putString(GuidianState.KEY_TARGET_PACKAGE,pkg); }
                if (o.has("caller_name")) e.putString(GuidianState.KEY_CALLER_NAME,o.optString("caller_name",AppPrefs.companionName(LittlePhoneActivity.this)).trim());
                if (o.has("caller_subtitle")) e.putString(GuidianState.KEY_CALLER_SUBTITLE,o.optString("caller_subtitle","从小手机打给你").trim());
                if (o.has("prompts")) e.putString(GuidianState.KEY_PROMPTS, o.optString("prompts", GuidianState.defaultPrompts(LittlePhoneActivity.this)));
                if (o.has("default_retry_minutes")) e.putInt(GuidianState.KEY_DEFAULT_RETRY_MIN,Math.max(1,Math.min(1440,o.optInt("default_retry_minutes",15))));
                e.apply();
                return true;
            } catch (Exception ex) { return false; }
        }

        @JavascriptInterface
        public boolean testGuidian() {
            try { return GuidianState.showPrompt(LittlePhoneActivity.this, true).optBoolean("ok", false); }
            catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String getCycleConfig() { return CycleState.collect(LittlePhoneActivity.this).toString(); }

        @JavascriptInterface
        public boolean setCycleConfig(String raw) {
            try {
                JSONObject o = new JSONObject(raw == null ? "{}" : raw);
                android.content.SharedPreferences.Editor e = AppPrefs.get(LittlePhoneActivity.this).edit();
                if (o.has("enabled")) e.putBoolean(AppPrefs.KEY_CYCLE_ENABLED, o.optBoolean("enabled"));
                if (o.has("last_start")) e.putString(AppPrefs.KEY_LAST_PERIOD_START, o.optString("last_start", ""));
                if (o.has("cycle_length")) e.putInt(AppPrefs.KEY_CYCLE_LENGTH, Math.max(15, Math.min(60, o.optInt("cycle_length",30))));
                if (o.has("period_length")) e.putInt(AppPrefs.KEY_PERIOD_LENGTH, Math.max(1, Math.min(14, o.optInt("period_length",6))));
                if (o.has("remind_before")) e.putInt(AppPrefs.KEY_CYCLE_REMIND_BEFORE, Math.max(0, Math.min(14, o.optInt("remind_before",3))));
                e.apply(); return true;
            } catch (Exception ex) { return false; }
        }

        @JavascriptInterface
        public boolean testReminder(String mode, String message) {
            try {
                if ("popup".equalsIgnoreCase(mode)) {
                    return CompanionService.showReminderPopup(LittlePhoneActivity.this, "小手机提醒", message == null ? "看我一下。" : message);
                }
                return CompanionService.showReminderNotification(LittlePhoneActivity.this, "小手机提醒", message == null ? "看我一下。" : message);
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean syncImportantDates(String raw) {
            try {
                JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
                java.util.HashSet<String> wanted = new java.util.HashSet<>();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject d = arr.optJSONObject(i);
                    if (d == null) continue;
                    String rid = d.optString("id", "").trim();
                    String title = d.optString("title", "").trim();
                    String date = d.optString("date", "").trim();
                    if (rid.isEmpty() || title.isEmpty() || date.isEmpty()) continue;
                    String localId = "lpdate_" + rid;
                    wanted.add(localId);
                    String kind = d.optString("kind", "important");
                    String repeat = ("relationship_start".equals(kind) || "anniversary".equals(kind)) ? "yearly" : "none";
                    int remind = Math.max(0, Math.min(30, d.optInt("remind_days", 3)));
                    CalendarState.upsertEvent(LittlePhoneActivity.this, localId, title, "solar", date, 0, 0, false, repeat, "our_days", d.optString("note", ""), remind, true, "little_phone_server");
                }
                JSONArray existing = CalendarState.events(LittlePhoneActivity.this);
                java.util.ArrayList<String> remove = new java.util.ArrayList<>();
                for (int i = 0; i < existing.length(); i++) {
                    JSONObject e = existing.optJSONObject(i);
                    if (e == null) continue;
                    String id = e.optString("id", "");
                    if (id.startsWith("lpdate_") && !wanted.contains(id)) remove.add(id);
                }
                for (String id : remove) CalendarState.deleteEvent(LittlePhoneActivity.this, id);
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String getFootprints() {
            try {
                JSONObject out=new JSONObject();
                out.put("user",ActivityEventStore.todayJourney(LittlePhoneActivity.this,20));
                out.put("daddy",PublicCompanionState.actions(LittlePhoneActivity.this,20));
                return out.toString();
            } catch(Exception e){ return "{\"user\":[],\"daddy\":[]}"; }
        }

        @JavascriptInterface
        public String getCallRecords() { return GuidianState.callRecords(LittlePhoneActivity.this,80).toString(); }

        @JavascriptInterface
        public String getAppGateState() { return AppGate.config(LittlePhoneActivity.this).toString(); }

        @JavascriptInterface
        public String listLockableApps() {
            try { return AppGate.handleCommand(LittlePhoneActivity.this, new JSONObject().put("action","list_lockable_apps").put("max",120)).toString(); }
            catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public String appGateAction(String raw) {
            try { return AppGate.handleCommand(LittlePhoneActivity.this, new JSONObject(raw == null ? "{}" : raw)).toString(); }
            catch (Exception e) { return "{\"ok\":false}"; }
        }

        @JavascriptInterface
        public void request(String requestId, String method, String path, String body) {
            new Thread(() -> {
                int status = 0;
                String response = "";
                try {
                    String base = AppPrefs.server(LittlePhoneActivity.this);
                    String token = AppPrefs.token(LittlePhoneActivity.this);
                    if (base.isEmpty() || token.isEmpty()) throw new IllegalStateException("not_connected");
                    String safePath = path == null ? "" : path.trim();
                    if (!safePath.startsWith("/")) safePath = "/" + safePath;
                    URL url = new URL(base + safePath);
                    HttpURLConnection c = (HttpURLConnection) url.openConnection();
                    c.setRequestMethod((method == null ? "GET" : method.trim().toUpperCase()));
                    c.setConnectTimeout(7000);
                    c.setReadTimeout(10000);
                    c.setUseCaches(false);
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    c.setRequestProperty("Accept", "application/json");
                    if (!"GET".equals(c.getRequestMethod()) && !"HEAD".equals(c.getRequestMethod())) {
                        byte[] bytes = (body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8);
                        c.setDoOutput(true);
                        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        c.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream();
                    if (in != null) response = readAll(in);
                    c.disconnect();
                } catch (Exception e) {
                    status = 599;
                    try {
                        JSONObject err = new JSONObject();
                        err.put("ok", false);
                        err.put("error", e.getMessage() == null ? "request_failed" : e.getMessage());
                        response = err.toString();
                    } catch (Exception ignored) { response = "{\"ok\":false,\"error\":\"request_failed\"}"; }
                }
                final int finalStatus = status;
                final String finalResponse = response == null || response.isEmpty() ? "{}" : response;
                runOnUiThread(() -> {
                    if (webView == null) return;
                    String js = "window.__littlePhoneResolve(" + JSONObject.quote(requestId) + "," + finalStatus + "," + JSONObject.quote(finalResponse) + ");";
                    webView.evaluateJavascript(js, null);
                });
            }, "littlephone-http").start();
        }
    }
}
