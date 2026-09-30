package com.littlephone.app;

import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;

/** 0.8.2-8 authoritative accessibility-overlay gate surface. */
public final class GateOverlay {
    private static WindowManager windowManager;
    private static GatePageView page;
    private static String targetPackage = "";

    private GateOverlay() { }
    public static boolean isShowing() { return page != null; }
    public static boolean isShowingFor(String pkg) { return page != null && pkg != null && pkg.equals(targetPackage); }
    public static String targetPackage() { return targetPackage; }

    public static void show(final ScreenshotService service, final String pkg) {
        if (service == null || pkg == null || pkg.trim().isEmpty()) return;
        if (Looper.myLooper() != Looper.getMainLooper()) {
            new Handler(Looper.getMainLooper()).post(() -> show(service, pkg));
            return;
        }
        final String target = pkg.trim();
        if (isShowingFor(target)) return;
        dismiss();
        try {
            WindowManager wm = (WindowManager) service.getSystemService(android.content.Context.WINDOW_SERVICE);
            if (wm == null) return;
            GatePageView next = new GatePageView(service, target, GateOverlay::dismiss);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.START;
            lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            lp.setTitle("LittlePhoneGate:" + target);
            wm.addView(next, lp);
            windowManager = wm;
            page = next;
            targetPackage = target;
            next.start();
            DebugState.append(service, "应用门禁 0.8.2-3：覆盖 " + target);
        } catch (Exception e) {
            DebugState.append(service, "应用门禁覆盖失败：" + ScreenshotService.shortMsg(e));
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
        page = null;
        windowManager = null;
        targetPackage = "";
        if (old != null) {
            try { old.stop(); } catch (Exception ignored) { }
            try { if (wm != null) wm.removeViewImmediate(old); } catch (Exception ignored) { }
        }
    }
}
