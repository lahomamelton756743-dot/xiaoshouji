package com.littlephone.app;

import android.app.Activity;
import android.os.Bundle;

/** Legacy shim: 0.8.2-3 no longer uses an Activity for app gating. */
public class LockActivity extends Activity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        finish();
    }
}
