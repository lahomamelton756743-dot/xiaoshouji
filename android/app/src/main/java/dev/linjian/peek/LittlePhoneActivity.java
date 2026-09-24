package com.littlephone.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 小手机 v0.5.1 Web/PWA 外壳。
 *
 * 视觉层使用本地 HTML/CSS/JS；设备能力和现有掌心窗模块继续由 Android 原生层提供。
 * Web 层只能通过这个 Activity 暴露的受控 bridge 访问本机状态和自建 server。
 */
public class LittlePhoneActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 9040;

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
        if (webView != null) webView.evaluateJavascript("window.LittlePhone && window.LittlePhone.refreshNative && window.LittlePhone.refreshNative();", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
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
            // v0.5.1：权限入口留在“小手机”里，不再跳回旧掌心窗主页。
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
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(16000);
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
