package com.littlephone.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.text.InputType;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.ViewGroup;

/** 小手机自己的连接设置。独立包名不会读取原小手机的 SharedPreferences。 */
public final class ConnectionSettings {
    private ConnectionSettings() {}

    public static void show(Activity activity, Runnable onSaved) {
        UITheme theme = UITheme.current(activity);
        int pad = dp(activity, 20);
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, dp(activity, 16), pad, dp(activity, 12));
        box.setBackground(theme.card(28, .8f));

        TextView hint = new TextView(activity);
        hint.setText("小手机是独立 App，需要单独保存同一套 server 地址和 Token。它们只保存在本机。\n服务器地址必须以 http:// 或 https:// 开头。");
        hint.setTextSize(12);
        hint.setTextColor(theme.subtext);
        hint.setLineSpacing(0, 1.25f);
        box.addView(hint, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText server = new EditText(activity);
        server.setHint("https://你的-server.onrender.com");
        server.setSingleLine(true);
        server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(AppPrefs.server(activity));
        server.setTextColor(theme.text); server.setHintTextColor(theme.subtext); server.setBackground(theme.soft(18)); server.setPadding(dp(activity,14),dp(activity,8),dp(activity,14),dp(activity,8));
        LinearLayout.LayoutParams serverLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); serverLp.topMargin=dp(activity,14); box.addView(server, serverLp);

        EditText token = new EditText(activity);
        token.setHint("LINJIAN_TOKEN");
        token.setSingleLine(true);
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(AppPrefs.token(activity));
        token.setTextColor(theme.text); token.setHintTextColor(theme.subtext); token.setBackground(theme.soft(18)); token.setPadding(dp(activity,14),dp(activity,8),dp(activity,14),dp(activity,8));
        LinearLayout.LayoutParams tokenLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); tokenLp.topMargin=dp(activity,9); box.addView(token, tokenLp);

        EditText device = new EditText(activity);
        device.setHint("device id，例如 android-phone");
        device.setSingleLine(true);
        device.setText(AppPrefs.device(activity));
        device.setTextColor(theme.text); device.setHintTextColor(theme.subtext); device.setBackground(theme.soft(18)); device.setPadding(dp(activity,14),dp(activity,8),dp(activity,14),dp(activity,8));
        LinearLayout.LayoutParams deviceLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); deviceLp.topMargin=dp(activity,9); box.addView(device, deviceLp);

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("连接小手机")
                .setView(box)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", null)
                .create();
        dialog.setOnShowListener(x -> {
            if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(theme.primary);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(theme.subtext);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String url = AppPrefs.cleanServer(server.getText().toString());
            if (!url.isEmpty() && !(url.startsWith("http://") || url.startsWith("https://"))) {
                server.setError("需要完整地址，例如 https://xxx.onrender.com");
                return;
            }
            String tokenValue = token.getText().toString().trim();
            if (url.isEmpty()) {
                server.setError("请填写 server 地址");
                return;
            }
            if (tokenValue.isEmpty()) {
                token.setError("请填写你自己的 LINJIAN_TOKEN");
                return;
            }
            SharedPreferences.Editor e = AppPrefs.get(activity).edit();
            e.putString(AppPrefs.KEY_SERVER, url);
            e.putString(AppPrefs.KEY_TOKEN, tokenValue);
            String d = device.getText().toString().trim();
            e.putString(AppPrefs.KEY_DEVICE, d.isEmpty() ? "android-phone" : d);
            e.apply();
            dialog.dismiss();
            if (onSaved != null) onSaved.run();
            });
        });
        dialog.show();
    }

    private static int dp(Activity a, int v) {
        return Math.round(v * a.getResources().getDisplayMetrics().density);
    }
}
