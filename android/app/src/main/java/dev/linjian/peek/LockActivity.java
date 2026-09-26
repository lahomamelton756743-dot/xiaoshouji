package com.littlephone.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/** v0.6.2 小手机统一应用门禁页。 */
public class LockActivity extends Activity {
    private String pkg;
    private TextView titleView, ownerView, remainView, reasonView, messageView, ownerNameView;
    private ImageView ownerAvatarView;
    private EditText requestReasonInput;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); handler.postDelayed(this, 1000); }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        pkg = getIntent() == null ? "" : getIntent().getStringExtra("package");
        if (pkg == null) pkg = "";
        buildUi();
        refresh();
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getStringExtra("package") != null) pkg = intent.getStringExtra("package");
        AppGate.markLockActivityVisible(pkg, true);
        refresh();
    }

    @Override protected void onResume() {
        super.onResume();
        AppGate.markLockActivityVisible(pkg, true);
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(tick);
        AppGate.markLockActivityVisible(pkg, false);
        super.onPause();
    }

    @Override protected void onDestroy() {
        AppGate.markLockActivityVisible(pkg, false);
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        ScreenshotService svc = ScreenshotService.getInstance();
        if (svc != null) svc.doHome();
        Toast.makeText(this, "还在门禁时间内，先回到桌面休息一下", Toast.LENGTH_SHORT).show();
    }

    private void buildUi() {
        final int daddyColor = parseColor(AppPrefs.companionIdentityColor(this), 0xFF6E83C1);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xFFF1F7FF);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(22), dp(36), dp(22), dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        LinearLayout owner = new LinearLayout(this);
        owner.setOrientation(LinearLayout.HORIZONTAL);
        owner.setGravity(Gravity.CENTER_VERTICAL);
        owner.setPadding(dp(12), dp(8), dp(14), dp(8));
        owner.setBackground(rounded(0x99FFFFFF, 26, withAlpha(daddyColor, 75), 1));

        ownerAvatarView = new ImageView(this);
        ownerAvatarView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        ownerAvatarView.setBackground(oval(0xDFFFFFFF, withAlpha(daddyColor, 120), 1));
        ownerAvatarView.setClipToOutline(true);
        owner.addView(ownerAvatarView, new LinearLayout.LayoutParams(dp(38), dp(38)));

        ownerNameView = text(AppPrefs.companionName(this), 12, daddyColor, true);
        LinearLayout.LayoutParams ownerNameLp = new LinearLayout.LayoutParams(-2, -2);
        ownerNameLp.leftMargin = dp(9);
        owner.addView(ownerNameView, ownerNameLp);
        root.addView(owner, lp(-2, -2, 0, 0, 0, 25));

        titleView = text("", 25, 0xFF263044, true);
        titleView.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(titleView, lp(-1, -2, 0, 0, 0, 8));

        ownerView = text("", 12, 0xFF6F778C, false);
        ownerView.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(ownerView, lp(-1, -2, 0, 0, 0, 12));

        remainView = text("", 12, daddyColor, true);
        remainView.setGravity(Gravity.CENTER_HORIZONTAL);
        remainView.setBackground(rounded(0xB8FFFFFF, 18, withAlpha(daddyColor, 70), 1));
        remainView.setPadding(dp(15), dp(8), dp(15), dp(8));
        root.addView(remainView, lp(-2, -2, 0, 0, 0, 20));

        reasonView = glassInfo("");
        root.addView(reasonView, lp(-1, -2, 0, 0, 0, 9));
        messageView = glassInfo("");
        root.addView(messageView, lp(-1, -2, 0, 0, 0, 18));

        TextView prompt = text("想现在打开？写一句理由给 " + AppPrefs.companionName(this), 11, 0xFF7B8497, false);
        root.addView(prompt, lp(-1, -2, 2, 0, 2, 8));

        requestReasonInput = new EditText(this);
        requestReasonInput.setHint("写下申请解锁的理由");
        requestReasonInput.setHintTextColor(0xFF9AA3B5);
        requestReasonInput.setTextColor(0xFF263044);
        requestReasonInput.setTextSize(13);
        requestReasonInput.setSingleLine(false);
        requestReasonInput.setMinLines(2);
        requestReasonInput.setPadding(dp(15), dp(12), dp(15), dp(12));
        requestReasonInput.setBackground(rounded(0xBFFFFFFF, 20, 0xB8FFFFFF, 1));
        root.addView(requestReasonInput, lp(-1, dp(78), 0, 0, 0, 13));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);

        Button request = button("申请解锁", true, daddyColor);
        request.setOnClickListener(v -> {
            String reason = requestReasonInput.getText().toString().trim();
            if (reason.length() == 0) {
                Toast.makeText(this, "先写一句解锁理由", Toast.LENGTH_SHORT).show();
                return;
            }
            AppGate.submitUnlockRequest(this, pkg, reason);
            requestReasonInput.setText("");
            Toast.makeText(this, "已经交给 " + AppPrefs.companionName(this), Toast.LENGTH_LONG).show();
        });
        actions.addView(request, new LinearLayout.LayoutParams(0, dp(44), 1f));

        Button home = button("回到桌面", false, daddyColor);
        LinearLayout.LayoutParams homeLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        homeLp.leftMargin = dp(9);
        home.setOnClickListener(v -> {
            ScreenshotService svc = ScreenshotService.getInstance();
            if (svc != null) svc.doHome();
            finish();
        });
        actions.addView(home, homeLp);
        root.addView(actions, lp(-1, dp(44), 0, 0, 0, 14));

        Button emergency = textButton("长按 5 秒紧急解锁");
        emergency.setSingleLine(true);
        emergency.setGravity(Gravity.CENTER);
        final Runnable emergencyRunnable = () -> {
            boolean ok = AppGate.tryEmergencyUnlock(this, pkg);
            Toast.makeText(this, ok ? "紧急解锁成功，已临时放行" : "紧急解锁失败，请稍后重试", Toast.LENGTH_LONG).show();
            if (ok) finish();
        };
        emergency.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                handler.postDelayed(emergencyRunnable, 5000);
                Toast.makeText(this, "继续按住 5 秒即可紧急解锁，不需要口令", Toast.LENGTH_SHORT).show();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                handler.removeCallbacks(emergencyRunnable);
                return true;
            }
            return true;
        });
        // 不再用固定 180dp 宽度，避免系统字体放大/不同字库时文字挤出边框。
        root.addView(emergency, lp(-1, dp(40), 16, 0, 16, 8));

        TextView foot = text("时间结束后会自动解除 · 紧急解锁会临时放行并写入记录", 9, 0xFF9AA3B4, false);
        foot.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(foot, lp(-1, -2, 0, 0, 0, 0));
        setContentView(scroll);
        applyOwnerAvatar();
    }

    private void refresh() {
        JSONObject lock = AppGate.currentLock(this, pkg);
        if (lock == null) { finish(); return; }
        long now = System.currentTimeMillis();
        long until = lock.optLong("locked_until_ms", 0);
        long remain = Math.max(0, until - now);
        String appName = lock.optString("app_name", AppGate.labelOf(this, pkg));
        String companion = AppPrefs.companionName(this);
        titleView.setText(appName + " 暂时休息一下");
        ownerView.setText(companion + " 给它关上了一会儿");
        ownerNameView.setText(companion);
        remainView.setText("剩余 " + remainText(remain));
        String reason = lock.optString("reason", "").trim();
        String message = lock.optString("message", "").trim();
        reasonView.setText(reason.isEmpty() ? "" : "为什么暂时关上\n" + reason);
        messageView.setText(message.isEmpty() ? "" : companion + " 留的话\n" + message);
        reasonView.setVisibility(reason.isEmpty() ? View.GONE : View.VISIBLE);
        messageView.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void applyOwnerAvatar() {
        String raw = AppPrefs.get(this).getString(AppPrefs.KEY_COMPANION_AVATAR, "");
        try {
            int comma = raw == null ? -1 : raw.indexOf(',');
            if (comma > 0 && raw.substring(0, comma).contains("base64")) raw = raw.substring(comma + 1);
            if (raw != null && !raw.trim().isEmpty()) {
                byte[] bytes = Base64.decode(raw, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap != null) { ownerAvatarView.setImageBitmap(bitmap); return; }
            }
        } catch (Exception ignored) { }
        ownerAvatarView.setImageDrawable(null);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setIncludeFontPadding(false);
        t.setLineSpacing(dp(3), 1f);
        t.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        return t;
    }

    private TextView glassInfo(String body) {
        TextView t = text(body, 12, 0xFF526078, false);
        t.setPadding(dp(16), dp(13), dp(16), dp(13));
        t.setBackground(rounded(0x8FFFFFFF, 20, 0xAFFFFFFF, 1));
        return t;
    }

    private Button button(String s, boolean primary, int accent) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false); b.setTextSize(12);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setTextColor(primary ? Color.WHITE : accent);
        b.setMinHeight(0); b.setPadding(dp(10), 0, dp(10), 0);
        b.setBackground(rounded(primary ? accent : 0xBFFFFFFF, 22, primary ? accent : withAlpha(accent, 70), 1));
        return b;
    }

    private Button textButton(String s) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false); b.setTextSize(10); b.setTextColor(0xFF7F889B);
        b.setMinHeight(0); b.setPadding(dp(8), 0, dp(8), 0);
        b.setBackground(rounded(0x00FFFFFF, 16, 0x00FFFFFF, 0));
        return b;
    }

    private GradientDrawable rounded(int color, int radius, int stroke, int strokeWidth) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color); g.setCornerRadius(dp(radius));
        if (strokeWidth > 0) g.setStroke(dp(strokeWidth), stroke);
        return g;
    }

    private GradientDrawable oval(int color, int stroke, int strokeWidth) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL); g.setColor(color);
        if (strokeWidth > 0) g.setStroke(dp(strokeWidth), stroke);
        return g;
    }

    private LinearLayout.LayoutParams lp(int w, int h, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h); p.setMargins(l,t,r,b); return p;
    }
    private int dp(int v) { return (int)(v * getResources().getDisplayMetrics().density + 0.5f); }
    private int parseColor(String value, int fallback) { try { return Color.parseColor(value); } catch (Exception e) { return fallback; } }
    private int withAlpha(int color, int alpha) { return (color & 0x00FFFFFF) | ((alpha & 0xFF) << 24); }
    private String remainText(long ms) {
        long sec = ms / 1000; long h = sec / 3600; long m = (sec % 3600) / 60; long s = sec % 60;
        if (h > 0) return h + " 小时 " + m + " 分 " + s + " 秒";
        if (m > 0) return m + " 分 " + s + " 秒";
        return s + " 秒";
    }
}
