package com.littlephone.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * 0.8.2-3 single app-gate page.
 * It is only hosted by GateOverlay over the locked target app. There is no form, no delayed
 * LockActivity and no gate inside Little Phone. The two user actions are Home or "找 GPT".
 */
public class GatePageView extends ScrollView {
    private final Context ctx;
    private final Runnable dismiss;
    private final String pkg;
    private TextView titleView, ownerView, remainView, reasonView, messageView, ownerNameView;
    private ImageView ownerAvatarView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean running;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            refresh();
            if (running) handler.postDelayed(this, 500);
        }
    };

    public GatePageView(Context context, String packageName, Runnable onDismiss) {
        super(context);
        this.ctx = context;
        this.pkg = packageName == null ? "" : packageName.trim();
        this.dismiss = onDismiss;
        buildUi();
        refresh();
    }

    public String getPackageNameForGate() { return pkg; }
    public void start() { running = true; handler.removeCallbacks(tick); handler.post(tick); }
    public void stop() { running = false; handler.removeCallbacksAndMessages(null); }

    @Override protected void onDetachedFromWindow() { stop(); super.onDetachedFromWindow(); }

    private void closePage() { stop(); if (dismiss != null) dismiss.run(); }

    private void buildUi() {
        final int companionColor = parseColor(AppPrefs.companionIdentityColor(ctx), 0xFF6E83C1);
        setFillViewport(true);
        setBackgroundColor(0xFFF1F7FF);
        setOverScrollMode(OVER_SCROLL_NEVER);

        LinearLayout root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(22), dp(42), dp(22), dp(30));
        addView(root, new ScrollView.LayoutParams(-1, -1));
        root.addView(new View(ctx), new LinearLayout.LayoutParams(1, 0, .25f));

        LinearLayout owner = new LinearLayout(ctx);
        owner.setOrientation(LinearLayout.HORIZONTAL);
        owner.setGravity(Gravity.CENTER_VERTICAL);
        owner.setPadding(dp(12), dp(8), dp(14), dp(8));
        owner.setBackground(rounded(0x99FFFFFF, 26, withAlpha(companionColor, 75), 1));

        ownerAvatarView = new ImageView(ctx);
        ownerAvatarView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        ownerAvatarView.setBackground(oval(0xDFFFFFFF, withAlpha(companionColor, 120), 1));
        ownerAvatarView.setClipToOutline(true);
        owner.addView(ownerAvatarView, new LinearLayout.LayoutParams(dp(40), dp(40)));

        ownerNameView = text(AppPrefs.companionName(ctx), 12, companionColor, true);
        LinearLayout.LayoutParams ownerNameLp = new LinearLayout.LayoutParams(-2, -2);
        ownerNameLp.leftMargin = dp(9);
        owner.addView(ownerNameView, ownerNameLp);
        root.addView(owner, lp(-2, -2, 0, 0, 0, 26));

        titleView = text("", 26, 0xFF263044, true);
        titleView.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(titleView, lp(-1, -2, 0, 0, 0, 8));

        ownerView = text("", 12, 0xFF6F778C, false);
        ownerView.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(ownerView, lp(-1, -2, 0, 0, 0, 13));

        remainView = text("", 12, companionColor, true);
        remainView.setGravity(Gravity.CENTER_HORIZONTAL);
        remainView.setBackground(rounded(0xB8FFFFFF, 18, withAlpha(companionColor, 70), 1));
        remainView.setPadding(dp(15), dp(8), dp(15), dp(8));
        root.addView(remainView, lp(-2, -2, 0, 0, 0, 22));

        reasonView = glassInfo("");
        root.addView(reasonView, lp(-1, -2, 0, 0, 0, 9));
        messageView = glassInfo("");
        root.addView(messageView, lp(-1, -2, 0, 0, 0, 22));

        TextView prompt = text("想现在打开？可以直接来找 GPT 申请解锁。", 11, 0xFF7B8497, false);
        prompt.setGravity(Gravity.CENTER);
        root.addView(prompt, lp(-1, -2, 4, 0, 4, 13));

        Button askGpt = button("找 GPT", true, companionColor);
        askGpt.setOnClickListener(v -> {
            askGpt.setEnabled(false);
            Toast.makeText(ctx, "已提交解锁申请，正在打开 GPT", Toast.LENGTH_SHORT).show();
            AppGate.requestUnlockAndOpenGpt(ctx, pkg);
        });
        root.addView(askGpt, lp(-1, dp(48), 0, 0, 0, 10));

        Button home = button("回到桌面", false, companionColor);
        home.setOnClickListener(v -> {
            closePage();
            ScreenshotService svc = ScreenshotService.getInstance();
            if (svc != null) svc.doHome();
        });
        root.addView(home, lp(-1, dp(46), 0, 0, 0, 16));

        TextView foot = text("门禁结束前，每次打开这个 App 都会回到这里。", 9, 0xFF9AA3B4, false);
        foot.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(foot, lp(-1, -2, 0, 0, 0, 0));
        root.addView(new View(ctx), new LinearLayout.LayoutParams(1, 0, .34f));
        applyOwnerAvatar();
    }

    private void refresh() {
        JSONObject lock = AppGate.currentLock(ctx, pkg);
        if (lock == null) { closePage(); return; }
        long now = System.currentTimeMillis();
        long until = lock.optLong("locked_until_ms", 0);
        long remain = Math.max(0, until - now);
        String appName = lock.optString("app_name", AppGate.labelOf(ctx, pkg));
        String companion = AppPrefs.companionName(ctx);
        titleView.setText(appName + " 暂时不能打开");
        ownerView.setText(companion + " 给它上了门禁");
        ownerNameView.setText(companion);
        remainView.setText("剩余 " + remainText(remain));
        String reason = lock.optString("reason", "").trim();
        String message = lock.optString("message", "").trim();
        reasonView.setText(reason.isEmpty() ? "" : "门禁原因\n" + reason);
        messageView.setText(message.isEmpty() ? "" : companion + " 留的话\n" + message);
        reasonView.setVisibility(reason.isEmpty() ? View.GONE : View.VISIBLE);
        messageView.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void applyOwnerAvatar() {
        String raw = AppPrefs.get(ctx).getString(AppPrefs.KEY_COMPANION_AVATAR, "");
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
        TextView t = new TextView(ctx);
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
        Button b = new Button(ctx);
        b.setText(s); b.setAllCaps(false); b.setTextSize(12);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setTextColor(primary ? Color.WHITE : accent);
        b.setMinHeight(0); b.setPadding(dp(10), 0, dp(10), 0);
        b.setBackground(rounded(primary ? accent : 0xBFFFFFFF, 23, primary ? accent : withAlpha(accent, 70), 1));
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
