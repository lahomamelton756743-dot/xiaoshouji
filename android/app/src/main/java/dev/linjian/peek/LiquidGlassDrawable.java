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
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

/**
 * Lightweight "liquid glass" surface that works without RenderScript/third-party UI libs.
 * It deliberately uses translucent spectral gradients, edge light and soft tint pools rather
 * than an opaque white card, so the shared backdrop can visually bleed through the surface.
 */
public final class LiquidGlassDrawable extends Drawable {
    public enum Kind { CARD, SOFT, HERO, NAV, ISLAND, CHIP, ACTION, CENTER }

    private final UITheme theme;
    private final Kind kind;
    private final float radius;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private int alpha = 255;

    public LiquidGlassDrawable(UITheme theme, Kind kind, float radiusDp) {
        this.theme = theme;
        this.kind = kind;
        this.radius = dp(radiusDp);
        stroke.setStyle(Paint.Style.STROKE);
    }

    @Override public void draw(Canvas canvas) {
        Rect b = getBounds();
        if (b.width() <= 0 || b.height() <= 0) return;
        RectF r = new RectF(b.left + dp(.7f), b.top + dp(.7f), b.right - dp(.7f), b.bottom - dp(.7f));
        float rad = Math.min(radius, Math.min(r.width(), r.height()) / 2f);

        int top = withAlpha(theme.glassTop, scaled(kind == Kind.HERO ? 228 : kind == Kind.NAV ? 208 : 194));
        int mid = withAlpha(theme.glassMid, scaled(kind == Kind.ACTION || kind == Kind.CENTER ? 205 : 152));
        int bot = withAlpha(theme.glassBottom, scaled(kind == Kind.HERO ? 174 : 132));
        if (kind == Kind.ACTION || kind == Kind.CENTER) {
            top = withAlpha(theme.actionTop, scaled(242));
            mid = withAlpha(theme.actionMid, scaled(232));
            bot = withAlpha(theme.actionBottom, scaled(240));
        } else if (kind == Kind.CHIP || kind == Kind.ISLAND) {
            top = withAlpha(theme.glassTop, scaled(210));
            mid = withAlpha(theme.primarySoft, scaled(148));
            bot = withAlpha(theme.glassBottom, scaled(160));
        }

        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(r.left, r.top, r.right, r.bottom,
                new int[]{top, mid, bot}, new float[]{0f, .53f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(r, rad, rad, paint);

        // Cold highlight pool: top-left / upper center.
        float highlightRadius = Math.max(r.width(), r.height()) * (kind == Kind.HERO ? .88f : .72f);
        paint.setShader(new RadialGradient(r.left + r.width() * .22f, r.top + r.height() * .12f,
                highlightRadius,
                new int[]{withAlpha(Color.WHITE, scaled(kind == Kind.NAV ? 150 : 182)), withAlpha(Color.WHITE, 0)},
                new float[]{0f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(r, rad, rad, paint);

        // Very light lavender/rose refraction at the opposite edge.
        int glow = kind == Kind.ACTION || kind == Kind.CENTER ? theme.accent : theme.refraction;
        paint.setShader(new RadialGradient(r.right - r.width() * .12f, r.bottom - r.height() * .08f,
                Math.max(r.width(), r.height()) * .58f,
                new int[]{withAlpha(glow, scaled(kind == Kind.HERO ? 98 : 70)), withAlpha(glow, 0)},
                new float[]{0f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(r, rad, rad, paint);

        // Glass rim: one bright outside line + one very faint tinted inner line.
        stroke.setShader(null);
        stroke.setStrokeWidth(dp(kind == Kind.NAV ? 1.05f : .9f));
        stroke.setColor(withAlpha(Color.WHITE, scaled(kind == Kind.ACTION || kind == Kind.CENTER ? 225 : 190)));
        canvas.drawRoundRect(r, rad, rad, stroke);

        RectF inner = new RectF(r.left + dp(1.8f), r.top + dp(1.8f), r.right - dp(1.8f), r.bottom - dp(1.8f));
        stroke.setStrokeWidth(dp(.55f));
        stroke.setColor(withAlpha(theme.line, scaled(110)));
        canvas.drawRoundRect(inner, Math.max(0, rad - dp(1.8f)), Math.max(0, rad - dp(1.8f)), stroke);

        // Thin specular line across the upper lip makes the card feel less flat on OLED.
        if (r.width() > dp(70) && r.height() > dp(34)) {
            float y = r.top + dp(2.7f);
            paint.setShader(new LinearGradient(r.left + rad * .45f, y, r.right - rad * .25f, y,
                    new int[]{0x00FFFFFF, withAlpha(Color.WHITE, scaled(165)), 0x00FFFFFF},
                    null, Shader.TileMode.CLAMP));
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(.75f));
            canvas.drawLine(r.left + rad * .55f, y, r.right - rad * .4f, y, paint);
            paint.setStyle(Paint.Style.FILL);
        }

        paint.setShader(null);
    }

    private int scaled(int a) { return Math.max(0, Math.min(255, Math.round(a * (alpha / 255f)))); }
    private static int withAlpha(int color, int a) { return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color)); }
    private static float dp(float v) { return v * Resources.getSystem().getDisplayMetrics().density; }

    @Override public void setAlpha(int alpha) { this.alpha = Math.max(0, Math.min(255, alpha)); invalidateSelf(); }
    @Override public void setColorFilter(ColorFilter colorFilter) { paint.setColorFilter(colorFilter); stroke.setColorFilter(colorFilter); invalidateSelf(); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
