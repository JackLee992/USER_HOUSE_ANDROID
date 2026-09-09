package io.github.jacklee992.wanba.appupdater;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit, non-exported callback. Only an OS-filled PendingIntent with our one-use token is accepted. */
public final class InstallResultReceiver extends BroadcastReceiver {
    static final String PREFS = "wanba_app_updater_install";
    private static Intent pendingUserAction;
    static void install(Context c, File apk, UpdateProtocol.Entry entry, AtomicBoolean cancel) throws Exception {
        synchronized (InstallResultReceiver.class) { pendingUserAction = null; }
        PackageInstaller installer = c.getPackageManager().getPackageInstaller();
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int prior = prefs.getInt("session", -1);
        if (prior != -1) { try { installer.abandonSession(prior); } catch (RuntimeException ignored) {} }
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName()); params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        int id = installer.createSession(params); boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
                byte[] bytes = new byte[UpdateFiles.BUFFER]; int n; while ((n = in.read(bytes)) != -1) { UpdateFiles.check(cancel); out.write(bytes, 0, n); } session.fsync(out);
            }
            UpdateFiles.check(cancel); String token = UUID.randomUUID().toString();
            UpdateProtocol.require(prefs.edit().putInt("session", id).putString("token", token).putString("status", "installing").putLong("targetVersion", entry.versionCode).commit(), "Cannot persist install session");
            Intent result = new Intent(c, InstallResultReceiver.class).setAction(c.getPackageName() + ".APK_INSTALL_RESULT").putExtra("token", token);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent callback = PendingIntent.getBroadcast(c, id, result, flags);
            // Cancellation wins before commit. Once committed, the OS owns the installation decision.
            synchronized (cancel) { UpdateFiles.check(cancel); session.commit(callback.getIntentSender()); committed = true; }
        } finally { if (!committed) { installer.abandonSession(id); prefs.edit().remove("token").remove("session").apply(); } }
    }
    @Override public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = intent.getStringExtra("token");
        if (token == null || !token.equals(prefs.getString("token", ""))) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent action = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (action == null) return;
            synchronized (InstallResultReceiver.class) { pendingUserAction = action; }
            prefs.edit().putString("status", "confirmation").apply();
        } else {
            synchronized (InstallResultReceiver.class) { pendingUserAction = null; }
            prefs.edit().putString("status", status == PackageInstaller.STATUS_SUCCESS ? "success" : "failed")
                    .remove("token").remove("session").apply();
        }
        AppUpdateActivity.notifyInstallResult();
    }
    static synchronized Intent takePendingAction() { Intent i = pendingUserAction; pendingUserAction = null; return i; }
}
