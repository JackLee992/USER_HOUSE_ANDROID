package io.github.jacklee992.wanba.appupdater;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.lang.ref.WeakReference;

/** Optional native entry point. Channel, package and trust cannot be supplied through Intent extras. */
public final class AppUpdateActivity extends Activity {
    private static WeakReference<AppUpdateActivity> foreground = new WeakReference<>(null);
    private UpdateController controller;
    private TextView status;
    private Button check, download, install, cancel;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Target 35+ draws behind system bars. The dark outer surface owns those insets,
        // while the white scrolling content starts below the status bar/cutout.
        int bars = Color.rgb(20, 39, 43);
        getWindow().setStatusBarColor(bars); getWindow().setNavigationBarColor(bars);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        FrameLayout surface = new FrameLayout(this); surface.setBackgroundColor(bars);
        surface.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                WindowInsetsController controller = view.getWindowInsetsController();
                if (controller != null) controller.setSystemBarsAppearance(0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.WHITE);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(dp(20),dp(20),dp(20),dp(20));
        scroll.addView(layout); surface.addView(scroll, new FrameLayout.LayoutParams(-1,-1));
        TextView title = new TextView(this); title.setText("App 更新"); title.setTextSize(24); layout.addView(title);
        status = new TextView(this); status.setText("从 GitHub 获取已签名的 App 更新。安装需要系统确认。\n游戏内容更新在原设置中管理。"); status.setPadding(0,dp(16),0,dp(16)); layout.addView(status);
        check = button(layout,"检查 App 更新"); download = button(layout,"下载更新"); install = button(layout,"安装已验证 APK"); cancel = button(layout,"取消下载");
        Button back = button(layout,"返回"); back.setOnClickListener(v -> finish());
        download.setEnabled(false); install.setEnabled(false); cancel.setEnabled(false); setContentView(surface); surface.requestApplyInsets();
        try { controller = new UpdateController(this, this::event); }
        catch (Exception e) { status.setText(e.getMessage()); check.setEnabled(false); return; }
        check.setOnClickListener(v -> { lock(); controller.check(); });
        download.setOnClickListener(v -> { lock(); controller.download(); });
        install.setOnClickListener(v -> {
            if (!getPackageManager().canRequestPackageInstalls()) {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                status.setText("允许安装后请返回，再点“安装已验证 APK”。"); return;
            }
            lock(); controller.install();
        });
        cancel.setOnClickListener(v -> controller.cancel());
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private Button button(LinearLayout layout,String text) { Button b = new Button(this); b.setText(text); layout.addView(b); return b; }
    private void lock() { check.setEnabled(false); download.setEnabled(false); install.setEnabled(false); cancel.setEnabled(true); }
    private void event(String state,String message) {
        status.setText(message);
        boolean done = state.equals("available") || state.equals("ready") || state.equals("current") || state.equals("error") || state.equals("cancelled");
        check.setEnabled(done); download.setEnabled(state.equals("available")); install.setEnabled(done && controller.isReady()); cancel.setEnabled(!done && !state.equals("installing"));
    }
    @Override protected void onResume() { super.onResume(); foreground = new WeakReference<>(this); showInstallResult(); }
    @Override protected void onPause() { foreground.clear(); super.onPause(); }
    @Override protected void onDestroy() { if (controller != null) controller.close(); super.onDestroy(); }
    static void notifyInstallResult() { AppUpdateActivity a = foreground.get(); if (a != null) a.runOnUiThread(a::showInstallResult); }
    private void showInstallResult() {
        Intent action = InstallResultReceiver.takePendingAction();
        if (action != null) { startActivity(action); return; }
        String result = getSharedPreferences(InstallResultReceiver.PREFS, MODE_PRIVATE).getString("status", "");
        if (result.equals("success")) { status.setText("Android 已完成 App 安装。"); check.setEnabled(true); }
        else if (result.equals("failed")) { status.setText("系统安装未完成，当前版本和游戏数据保持不变。可重试。"); check.setEnabled(true); install.setEnabled(controller != null && controller.isReady()); }
        else if (result.equals("confirmation")) { status.setText("安装确认尚未完成。若系统提示已关闭，请重新检查并安装。"); check.setEnabled(true); install.setEnabled(controller != null && controller.isReady()); }
    }
}
