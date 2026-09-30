package com.littlephone.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Restores the persistent command bridge after reboot or in-place APK update.
 * Remote gate commands must not depend on the user manually reopening settings.
 */
public class StartupReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : String.valueOf(intent.getAction());
        CompanionService.ensureRunning(context, "receiver:" + action);
    }
}
