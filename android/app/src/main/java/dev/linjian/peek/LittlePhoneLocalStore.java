package com.littlephone.app;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * 小手机本地缓存库。
 * 这里只保存已成功同步的业务 JSON，不保存设备原始快照。
 * server 暂时不可达时，WebView 仍能读取最近一次成功同步的信/纸条/留痕/待办等。
 */
public final class LittlePhoneLocalStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "little_phone_local.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "sync_cache";
    private static volatile LittlePhoneLocalStore instance;

    private LittlePhoneLocalStore(Context ctx) { super(ctx.getApplicationContext(), DB_NAME, null, DB_VERSION); }

    public static LittlePhoneLocalStore get(Context ctx) {
        if (instance == null) {
            synchronized (LittlePhoneLocalStore.class) {
                if (instance == null) instance = new LittlePhoneLocalStore(ctx);
            }
        }
        return instance;
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS " + TABLE + " (cache_key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    public synchronized boolean putJson(String key, String json) {
        if (key == null || key.trim().isEmpty() || json == null) return false;
        try {
            SQLiteDatabase db = getWritableDatabase();
            ContentValues values = new ContentValues();
            values.put("cache_key", key);
            values.put("json", json);
            values.put("updated_at", System.currentTimeMillis());
            return db.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE) != -1;
        } catch (Exception e) { return false; }
    }

    public synchronized String getJson(String key) {
        if (key == null || key.trim().isEmpty()) return "";
        Cursor c = null;
        try {
            c = getReadableDatabase().rawQuery("SELECT json FROM " + TABLE + " WHERE cache_key=? LIMIT 1", new String[]{key});
            return c.moveToFirst() ? c.getString(0) : "";
        } catch (Exception e) { return ""; }
        finally { if (c != null) c.close(); }
    }
}
