package com.littlephone.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** 双人消息页：消息与留痕分开，所有消息都保留服务端时间戳。 */
public class MessageActivity extends Activity {
    private LinearLayout feed;
    private TextView empty;
    private EditText composer;
    private Button send;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(UITheme.current(this).bgTop);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        setContentView(buildPage());
        if (AppPrefs.server(this).isEmpty()) ConnectionSettings.show(this, this::refresh);
        else refresh();
    }

    private View buildPage() {
        UITheme t = UITheme.current(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackground(t.background());

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(12), dp(18), dp(104));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(page);
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.addView(text("消息", 29, t.text, true));
        titleBox.addView(text("想对彼此说的话，留在这里。", 12, t.subtext, false));
        titleRow.addView(titleBox, new LinearLayout.LayoutParams(0, -2, 1));
        Button settings = glassButton("连接");
        settings.setOnClickListener(v -> ConnectionSettings.show(this, this::refresh));
        titleRow.addView(settings, new LinearLayout.LayoutParams(dp(64), dp(44)));
        page.addView(titleRow, marginBottom(18));

        LinearLayout composeCard = card();
        composer = new EditText(this);
        composer.setHint("给 " + AppPrefs.companionName(this) + " 留一句……");
        composer.setTextSize(15);
        composer.setTextColor(t.text);
        composer.setHintTextColor(t.subtext);
        composer.setBackgroundColor(Color.TRANSPARENT);
        composer.setMinHeight(dp(68));
        composer.setGravity(Gravity.TOP);
        composeCard.addView(composer, new LinearLayout.LayoutParams(-1, -2));
        send = glassButton("发送");
        send.setTextColor(Color.WHITE);
        send.setBackground(t.action());
        send.setElevation(dp(5));
        send.setOnClickListener(v -> sendMessage());
        composeCard.addView(send, new LinearLayout.LayoutParams(-1, dp(44)));
        page.addView(composeCard, marginBottom(18));

        empty = text("这里还没有消息。", 14, t.subtext, false);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(0, dp(40), 0, dp(30));
        page.addView(empty);
        feed = new LinearLayout(this);
        feed.setOrientation(LinearLayout.VERTICAL);
        page.addView(feed, new LinearLayout.LayoutParams(-1, -2));

        root.addView(bottomNav(), navParams());
        return root;
    }

    private LinearLayout bottomNav() {
        UITheme t = UITheme.current(this);
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(6), dp(8), dp(6));
        nav.setBackground(t.navBar());
        nav.setElevation(dp(10));
        String[] labels = {"首页", "留痕", "＋", "消息", "我们"};
        for (String label : labels) {
            Button b = glassButton(label);
            boolean selected = "消息".equals(label);
            b.setTextSize("＋".equals(label) ? 25 : 11);
            b.setTextColor("＋".equals(label) ? Color.WHITE : (selected ? t.primary : t.subtext));
            b.setAlpha(selected || "＋".equals(label) ? 1f : .68f);
            b.setBackground("＋".equals(label) ? t.navCenterBubble() : (selected ? t.navIconIsland() : null));
            b.setElevation("＋".equals(label) ? dp(8) : (selected ? dp(3) : 0));
            bindNav(b, label);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(54), 1); lp.leftMargin=dp(2); lp.rightMargin=dp(2); nav.addView(b, lp);
        }
        return nav;
    }

    private void bindNav(Button b, String label) {
        if ("首页".equals(label)) b.setOnClickListener(v -> openMain("life"));
        else if ("留痕".equals(label)) b.setOnClickListener(v -> { startActivity(new Intent(this, TraceActivity.class)); finish(); });
        else if ("＋".equals(label)) b.setOnClickListener(v -> { Intent i = new Intent(this, TraceActivity.class); i.putExtra("compose", true); startActivity(i); finish(); });
        else if ("消息".equals(label)) b.setOnClickListener(v -> composer.requestFocus());
        else if ("我们".equals(label)) b.setOnClickListener(v -> openMain("see"));
    }

    private void openMain(String tab) {
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra("open_tab", tab);
        i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
        finish();
    }

    private FrameLayout.LayoutParams navParams() {
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, dp(66), Gravity.BOTTOM);
        p.leftMargin = dp(18); p.rightMargin = dp(18); p.bottomMargin = dp(14);
        return p;
    }

    private void refresh() {
        String server = validServerOrPrompt();
        if (server == null) return;
        new Thread(() -> {
            try {
                JSONObject r = request("GET", server + "/api/messages?limit=60", null);
                JSONArray arr = r.optJSONArray("messages");
                runOnUiThread(() -> render(arr));
            } catch (Exception e) {
                runOnUiThread(() -> toast("消息暂时没连上：" + shortMsg(e)));
            }
        }).start();
    }

    private void render(JSONArray arr) {
        feed.removeAllViews();
        int n = arr == null ? 0 : arr.length();
        empty.setVisibility(n == 0 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < n; i++) {
            JSONObject m = arr.optJSONObject(i);
            if (m == null) continue;
            LinearLayout c = card();
            c.addView(text(m.optString("author", ""), 13, UITheme.current(this).text, true));
            c.addView(text(formatTime(m.optString("created_at", "")), 10, UITheme.current(this).subtext, false), marginBottom(7));
            c.addView(text(m.optString("content", ""), 15, UITheme.current(this).text, false));
            feed.addView(c, marginBottom(11));
        }
    }

    private void sendMessage() {
        String content = composer.getText().toString().trim();
        if (content.isEmpty()) return;
        String server = validServerOrPrompt();
        if (server == null) return;
        send.setEnabled(false); send.setText("发送中…");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("author", AppPrefs.userName(this));
                body.put("content", content);
                request("POST", server + "/api/messages", body);
                runOnUiThread(() -> { composer.setText(""); send.setEnabled(true); send.setText("发送"); refresh(); });
            } catch (Exception e) {
                runOnUiThread(() -> { send.setEnabled(true); send.setText("发送"); toast("消息没发出去：" + shortMsg(e)); });
            }
        }).start();
    }

    private String validServerOrPrompt() {
        String server = AppPrefs.server(this);
        if (server.isEmpty()) {
            ConnectionSettings.show(this, this::refresh);
            return null;
        }
        if (!(server.startsWith("http://") || server.startsWith("https://"))) {
            toast("服务器地址需要以 http:// 或 https:// 开头");
            ConnectionSettings.show(this, this::refresh);
            return null;
        }
        return server;
    }

    private JSONObject request(String method, String target, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(20000); c.setRequestMethod(method);
        String token = AppPrefs.token(this);
        if (!token.isEmpty()) { c.setRequestProperty("X-Auth-Token", token); c.setRequestProperty("Authorization", "Bearer " + token); }
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream o = c.getOutputStream()) { o.write(bytes); }
        }
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        String payload = readText(in);
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code + " " + payload);
        return new JSONObject(payload);
    }

    private String readText(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream x = in; ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] b = new byte[4096]; int n; while ((n = x.read(b)) > 0) o.write(b, 0, n);
            return o.toString("UTF-8");
        }
    }

    private String formatTime(String iso) {
        if (iso == null || iso.isEmpty()) return "";
        try {
            SimpleDateFormat input = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            input.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = input.parse(iso);
            return new SimpleDateFormat("M月d日 HH:mm", Locale.CHINA).format(d);
        } catch (Exception e) { return iso.replace("T", " ").replace("Z", ""); }
    }

    private String shortMsg(Exception e) { String s = e.getMessage(); return s == null ? "未知错误" : (s.length() > 100 ? s.substring(0, 100) : s); }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
    private TextView text(String s, int sp, int color, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setLineSpacing(0, 1.25f); if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); return t; }
    private Button glassButton(String s) { UITheme t=UITheme.current(this); Button b = new Button(this); b.setText(s); b.setTextSize(12); b.setAllCaps(false); b.setTextColor(t.text); b.setPadding(dp(8),0,dp(8),0); b.setBackground(t.chip(false)); b.setElevation(dp(2)); return b; }
    private LinearLayout card() { UITheme t=UITheme.current(this); LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(17),dp(16),dp(17),dp(16)); l.setBackground(t.card(25,.8f)); l.setElevation(dp(4)); return l; }
    private GradientDrawable round(int color, int r) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(r)); return g; }
    private GradientDrawable roundStroke(int color, int stroke, int r) { GradientDrawable g = round(color,r); g.setStroke(dp(1),stroke); return g; }
    private LinearLayout.LayoutParams marginBottom(int d) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,-2); p.bottomMargin = dp(d); return p; }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
