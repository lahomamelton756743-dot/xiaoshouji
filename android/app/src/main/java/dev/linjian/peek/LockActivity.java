package com.littlephone.app;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Toast;

/** Activity host for the same gate page; accessibility overlay is the reliable cross-app fallback. */
public class LockActivity extends Activity {
    private String pkg = "";
    private GatePageView page;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        readPackage(getIntent());
        rebuildPage();
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readPackage(intent);
        rebuildPage();
        AppGate.markLockActivityVisible(pkg, true);
    }

    @Override protected void onResume() {
        super.onResume();
        GateOverlay.dismiss();
        AppGate.markLockActivityVisible(pkg, true);
        if (page != null) page.start();
    }

    @Override protected void onPause() {
        if (page != null) page.stop();
        AppGate.markLockActivityVisible(pkg, false);
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (page != null) page.stop();
        AppGate.markLockActivityVisible(pkg, false);
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        ScreenshotService svc = ScreenshotService.getInstance();
        if (svc != null) svc.doHome();
        Toast.makeText(this, "还在门禁时间内，先回到桌面休息一下", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void readPackage(android.content.Intent intent) {
        String value = intent == null ? "" : intent.getStringExtra("package");
        pkg = value == null ? "" : value;
    }

    private void rebuildPage() {
        if (page != null) page.stop();
        page = new GatePageView(this, pkg, this::finish);
        setContentView(page);
    }
}
