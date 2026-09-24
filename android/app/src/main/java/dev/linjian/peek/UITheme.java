package com.littlephone.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Drawable;

public class UITheme {
    public final String name;
    public final int bgTop, bgMid, bgBottom, card, cardSoft, primary, primarySoft, accent, text, subtext, line, danger;
    public final int glassTop, glassMid, glassBottom, actionTop, actionMid, actionBottom, refraction;
    public final int backdropBlue, backdropLavender, backdropCyan, backdropRose;
    public final boolean dark;

    private UITheme(String name, int bgTop, int bgBottom, int card, int cardSoft, int primary, int primarySoft, int accent, int text, int subtext, int line, int danger, boolean dark) {
        this.name = name; this.bgTop = bgTop; this.bgBottom = bgBottom; this.card = card; this.cardSoft = cardSoft;
        this.primary = primary; this.primarySoft = primarySoft; this.accent = accent; this.text = text; this.subtext = subtext;
        this.line = line; this.danger = danger; this.dark = dark;
        this.bgMid = blend(bgTop, bgBottom, .46f);
        this.glassTop = dark ? blend(card, Color.WHITE, .08f) : Color.rgb(255, 255, 255);
        this.glassMid = dark ? blend(cardSoft, primary, .18f) : blend(Color.rgb(225, 241, 255), primarySoft, .34f);
        this.glassBottom = dark ? blend(card, accent, .12f) : Color.rgb(239, 231, 251);
        this.actionTop = dark ? blend(primary, Color.WHITE, .08f) : Color.rgb(156, 191, 255);
        this.actionMid = dark ? primary : Color.rgb(121, 145, 238);
        this.actionBottom = dark ? blend(primary, accent, .22f) : Color.rgb(204, 157, 224);
        this.refraction = dark ? accent : Color.rgb(224, 172, 211);
        this.backdropBlue = dark ? blend(bgTop, primary, .35f) : Color.rgb(170, 214, 255);
        this.backdropLavender = dark ? blend(bgTop, accent, .28f) : Color.rgb(206, 190, 246);
        this.backdropCyan = dark ? blend(bgBottom, primary, .22f) : Color.rgb(177, 232, 241);
        this.backdropRose = dark ? blend(bgBottom, accent, .25f) : Color.rgb(242, 193, 214);
    }

    public static UITheme current(Context ctx) {
        String n = AppPrefs.get(ctx).getString(AppPrefs.KEY_THEME, "液态玻璃");
        return byName(n);
    }

    public static UITheme byName(String n) {
        if ("液态玻璃".equals(n)) return new UITheme("液态玻璃",
                Color.rgb(235, 245, 255), Color.rgb(249, 242, 251), Color.argb(152, 255, 255, 255), Color.argb(112, 245, 249, 255),
                Color.rgb(101, 124, 218), Color.argb(132, 205, 224, 255), Color.rgb(220, 157, 194),
                Color.rgb(39, 42, 57), Color.rgb(103, 108, 130), Color.argb(110, 196, 211, 235), Color.rgb(211, 105, 126), false);
        if ("雾蓝白".equals(n)) return new UITheme("雾蓝白",
                Color.rgb(239, 247, 252), Color.rgb(250, 252, 255), Color.WHITE, Color.rgb(244, 249, 252),
                Color.rgb(112, 178, 198), Color.rgb(228, 244, 249), Color.rgb(190, 132, 160),
                Color.rgb(42, 52, 60), Color.rgb(111, 126, 135), Color.rgb(226, 235, 240), Color.rgb(226, 105, 122), false);
        if ("白桃粉".equals(n)) return new UITheme("白桃粉",
                Color.rgb(255, 244, 248), Color.rgb(255, 251, 252), Color.rgb(255, 253, 254), Color.rgb(255, 245, 249),
                Color.rgb(211, 112, 145), Color.rgb(255, 226, 236), Color.rgb(151, 188, 180),
                Color.rgb(67, 48, 57), Color.rgb(145, 110, 123), Color.rgb(246, 215, 226), Color.rgb(222, 91, 112), false);
        if ("夜航黑".equals(n)) return new UITheme("夜航黑",
                Color.rgb(19, 24, 31), Color.rgb(28, 34, 42), Color.rgb(38, 45, 55), Color.rgb(46, 54, 65),
                Color.rgb(116, 188, 177), Color.rgb(50, 68, 75), Color.rgb(219, 145, 170),
                Color.rgb(239, 245, 242), Color.rgb(178, 194, 190), Color.rgb(63, 75, 86), Color.rgb(234, 112, 128), true);
        if ("星云紫".equals(n)) return new UITheme("星云紫",
                Color.rgb(245, 240, 255), Color.rgb(251, 247, 255), Color.rgb(255, 255, 255), Color.rgb(237, 232, 245),
                Color.rgb(184, 168, 216), Color.rgb(237, 232, 245), Color.rgb(224, 212, 240),
                Color.rgb(57, 50, 70), Color.rgb(126, 112, 148), Color.rgb(226, 212, 240), Color.rgb(225, 105, 122), false);
        if ("薄荷透明".equals(n)) return new UITheme("薄荷透明",
                Color.rgb(238, 252, 248), Color.rgb(252, 255, 253), Color.argb(235, 255, 255, 255), Color.argb(210, 242, 251, 248),
                Color.rgb(100, 190, 172), Color.rgb(222, 248, 242), Color.rgb(244, 171, 184),
                Color.rgb(42, 62, 57), Color.rgb(104, 132, 125), Color.rgb(218, 241, 235), Color.rgb(225, 101, 118), false);
        return new UITheme("奶油绿",
                Color.rgb(248, 252, 249), Color.rgb(243, 250, 247), Color.WHITE, Color.rgb(247, 252, 249),
                Color.rgb(103, 181, 165), Color.rgb(229, 247, 242), Color.rgb(214, 158, 174),
                Color.rgb(43, 59, 54), Color.rgb(109, 134, 128), Color.rgb(226, 238, 234), Color.rgb(226, 105, 122), false);
    }

    public Drawable background() {
        return new LiquidBackdropDrawable(this);
    }

    public Drawable card(float radiusDp, float strokeDp) {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.CARD, radiusDp);
    }

    public Drawable soft(float radiusDp) {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.SOFT, radiusDp);
    }

    public Drawable pill(boolean selected) {
        return new LiquidGlassDrawable(this, selected ? LiquidGlassDrawable.Kind.ACTION : LiquidGlassDrawable.Kind.CHIP, 18);
    }

    public Drawable chip(boolean selected) {
        return new LiquidGlassDrawable(this, selected ? LiquidGlassDrawable.Kind.ISLAND : LiquidGlassDrawable.Kind.CHIP, 16);
    }

    public Drawable hero() {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.HERO, 29);
    }

    public Drawable navBar() {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.NAV, 35);
    }

    public Drawable navIconIsland() {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.ISLAND, 24);
    }

    public Drawable navCenterBubble() {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.CENTER, 40);
    }

    public Drawable navItem(boolean selected) {
        return new LiquidGlassDrawable(this, selected ? LiquidGlassDrawable.Kind.ISLAND : LiquidGlassDrawable.Kind.SOFT, 16);
    }

    public Drawable action() {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.ACTION, 24);
    }

    public Drawable windowPanel(boolean left) {
        return new LiquidGlassDrawable(this, LiquidGlassDrawable.Kind.SOFT, 22);
    }

    private static int blend(int from, int to, float amount) {
        float x = Math.max(0f, Math.min(1f, amount));
        int a = Math.round(Color.alpha(from) * (1f - x) + Color.alpha(to) * x);
        int r = Math.round(Color.red(from) * (1f - x) + Color.red(to) * x);
        int g = Math.round(Color.green(from) * (1f - x) + Color.green(to) * x);
        int b = Math.round(Color.blue(from) * (1f - x) + Color.blue(to) * x);
        return Color.argb(a, r, g, b);
    }

    public static float dp(float v) { return v * android.content.res.Resources.getSystem().getDisplayMetrics().density; }
}
