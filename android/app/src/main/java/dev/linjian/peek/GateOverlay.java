package com.littlephone.app;

import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;

/**
 * Reliable app-gate surface hosted by the connected AccessibilityService.
 * TYPE_ACCESSIBILITY_OVERLAY is specifically intended for accessibility UI that intercepts
 * interaction over another app, so it does not depend on background Activity launch permission.
 */
public final class GateOverlay {
    private static WindowManager windowManager;
    private static GatePageView page;
    private static String packageName = "";
    private static long shownAt = 0L;

    private GateOverlay() { }

    public static boolean isShowing() { return page != null; }
    public static boolean isShowingFor(String pkg) { return page != null && pkg != null && pkg.equals(packageName); }
    public static long shownAt() { return shownAt; }

    public static void show(final ScreenshotService service, final String pkg) {
        if (service == null || pkg == null || pkg.trim().isEmpty()) return;
        if (Looper.myLooper() != Looper.getMainLooper()) {
            new Handler(Looper.getMainLooper()).post(() -> show(service, pkg));
            return;
        }
        String target = pkg.trim();
        if (isShowingFor(target)) return;
        dismiss();
        try {
            windowManager = (WindowManager) service.getSystemService(android.content.Context.WINDOW_SERVICE);
            if (windowManager == null) return;
            packageName = target;
            page = new GatePageView(service, target, GateOverlay::dismiss);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.START;
            lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            lp.setTitle("LittlePhoneAppGate:" + target);
            windowManager.addView(page, lp);
            shownAt = System.currentTimeMillis();
            page.start();
            AppGate.markLockActivityVisible(target, true);
            DebugState.append(service, "应用门禁：无障碍覆盖层已盖住目标 App：" + target);
        } catch (Exception e) {
            DebugState.append(service, "应用门禁覆盖层启动失败：" + ScreenshotService.shortMsg(e));
            dismiss();
        }
    }

    public static void dismiss() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            new Handler(Looper.getMainLooper()).post(GateOverlay::dismiss);
            return;
        }
        GatePageView old = page;
        WindowManager wm = windowManager;
        String oldPackage = packageName;
        page = null;
        windowManager = null;
        packageName = "";
        shownAt = 0L;
        if (old != null) {
            try { old.stop(); } catch (Exception ignored) { }
            try { if (wm != null) wm.removeViewImmediate(old); } catch (Exception ignored) { }
        }
        if (!oldPackage.isEmpty()) AppGate.markLockActivityVisible(oldPackage, false);
    }
}
