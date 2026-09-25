package com.littlephone.app;

import android.content.res.Resources;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

/** Shared pearlescent backdrop. The low-contrast blobs are intentionally large for K90-class tall OLED screens. */
public final class LiquidBackdropDrawable extends Drawable {
    private final UITheme theme;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private int alpha = 255;

    public LiquidBackdropDrawable(UITheme theme) { this.theme = theme; }

    @Override public void draw(Canvas canvas) {
        Rect r = getBounds();
        if (r.width() <= 0 || r.height() <= 0) return;
        p.setShader(new LinearGradient(r.left, r.top, r.right, r.bottom,
                new int[]{withA(theme.bgTop, 255), withA(theme.bgMid, 255), withA(theme.bgBottom, 255)},
                new float[]{0f, .48f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRect(r, p);

        float w = r.width(), h = r.height();
        blob(canvas, r.left + w * .16f, r.top + h * .10f, w * .70f, theme.backdropBlue, 92);
        blob(canvas, r.right - w * .05f, r.top + h * .28f, w * .72f, theme.backdropLavender, 72);
        blob(canvas, r.left + w * .42f, r.top + h * .62f, w * .82f, theme.backdropCyan, 48);
        blob(canvas, r.right - w * .16f, r.bottom - h * .08f, w * .58f, theme.backdropRose, 52);
        p.setShader(null);
    }

    private void blob(Canvas c, float x, float y, float radius, int color, int a) {
        p.setShader(new RadialGradient(x, y, radius,
                new int[]{withA(color, scale(a)), withA(color, 0)}, new float[]{0f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(x, y, radius, p);
    }

    private int scale(int a) { return Math.max(0, Math.min(255, Math.round(a * (alpha / 255f)))); }
    private static int withA(int c, int a) { return Color.argb(a, Color.red(c), Color.green(c), Color.blue(c)); }
    @Override public void setAlpha(int alpha) { this.alpha = Math.max(0, Math.min(255, alpha)); invalidateSelf(); }
    @Override public void setColorFilter(ColorFilter colorFilter) { p.setColorFilter(colorFilter); invalidateSelf(); }
    @Override public int getOpacity() { return PixelFormat.OPAQUE; }
}
