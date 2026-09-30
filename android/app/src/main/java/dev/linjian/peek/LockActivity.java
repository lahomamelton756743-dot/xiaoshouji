package com.littlephone.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Full-screen gate surface. This is the first enforcement layer; the accessibility overlay is
 * only a fallback for ROMs that refuse a background Activity launch.
 */
public class LockActivity extends Activity {
    private static volatile LockActivity visibleInstance;
    private String pkg = "";
    private GatePageView page;

    public static void dismissVisible() {
        LockActivity a = visibleInstance;
        if (a != null) {
            a.runOnUiThread(() -> {
                try { a.finishAndRemoveTask(); } catch (Exception e) { try { a.finish(); } catch (Exception ignored) { } }
            });
        }
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        readPackage(getIntent());
        render();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readPackage(intent);
        render();
    }

    @Override protected void onResume() {
        super.onResume();
        visibleInstance = this;
        AppGate.markLockActivityVisible(pkg, true);
        GateOverlay.dismiss();
        if (AppGate.currentLock(this, pkg) == null) finish();
        else if (page != null) page.start();
    }

    @Override protected void onPause() {
        if (page != null) page.stop();
        AppGate.markLockActivityVisible(pkg, false);
        if (visibleInstance == this) visibleInstance = null;
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (page != null) page.stop();
        AppGate.markLockActivityVisible(pkg, false);
        if (visibleInstance == this) visibleInstance = null;
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        ScreenshotService svc = ScreenshotService.getInstance();
        boolean home = svc != null && svc.doHome();
        if (!home) {
            try {
                Intent i = new Intent(Intent.ACTION_MAIN);
                i.addCategory(Intent.CATEGORY_HOME);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) { }
        }
        Toast.makeText(this, "门禁还在，先回到桌面", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void readPackage(Intent intent) {
        String value = intent == null ? "" : intent.getStringExtra("package");
        pkg = value == null ? "" : value.trim();
    }

    private void render() {
        if (pkg.isEmpty() || AppGate.currentLock(this, pkg) == null) {
            finish();
            return;
        }
        if (page != null) page.stop();
        page = new GatePageView(this, pkg, this::finish);
        setContentView(page);
        page.start();
    }
}
