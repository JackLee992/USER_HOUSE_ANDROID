package io.github.jacklee992.wanba;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.view.View;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends Activity {
    private static final int PICK_FILES = 4101;
    private static final int CREATE_BACKUP = 4102;
    private static final int MAX_BACKUP_BYTES = 8 * 1024 * 1024;
    private static final long MAX_IMPORT_FILE_BYTES = 32L * 1024 * 1024;
    private static final long MAX_IMPORT_TOTAL_BYTES = 64L * 1024 * 1024;
    private static final int MAX_IMPORT_FILES = 64;
    private static final String PAUSE_AND_SAVE = "(()=>{const a=window.wanbaApp;if(a){a.pause();a.save();}return true;})()";
    private static final String SAVE = "(()=>{window.wanbaApp?.save();return true;})()";
    private static final String BACK = "(()=>{const a=window.wanbaApp;return !!(a&&a.back());})()";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final AtomicBoolean backupBusy = new AtomicBoolean(false);
    private WebView webView;
    private FrameLayout frame;
    private volatile boolean trustedDocument;
    private boolean destroyed;
    private boolean activityPaused;
    private boolean webPaused;
    private boolean backPending;
    private Runnable pendingPause;
    private ValueCallback<Uri[]> fileCallback;
    private Set<String> requestedExtensions = new LinkedHashSet<>(Arrays.asList("json", "dat", "wav"));
    private boolean allowMultiple;
    private byte[] pendingBackup;
    private OnBackInvokedCallback predictiveBack;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(255, 247, 234));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return insets;
            });
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        openCompatibleWebView();
        if (Build.VERSION.SDK_INT >= 33) {
            predictiveBack = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, predictiveBack);
        }
    }

    private void openCompatibleWebView() {
        PackageInfo provider;
        try { provider = WebView.getCurrentWebViewPackage(); }
        catch (RuntimeException error) { provider = null; }
        frame.removeAllViews();
        if (provider == null || !LocalAssetPolicy.compatibleWebView(provider.versionName)) {
            showWebViewCompatibilityPrompt(provider);
            return;
        }
        try { createWebView(); }
        catch (RuntimeException error) { webView = null; showWebViewCompatibilityPrompt(provider); }
    }

    private void showWebViewCompatibilityPrompt(PackageInfo provider) {
        LinearLayout prompt = new LinearLayout(this);
        prompt.setOrientation(LinearLayout.VERTICAL);
        prompt.setGravity(Gravity.CENTER);
        int padding = Math.round(28 * getResources().getDisplayMetrics().density);
        prompt.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("更新系统 WebView");
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        TextView explanation = new TextView(this);
        explanation.setText("请先更新 Android System WebView 后重新打开。\n玩吧需要 WebView 124 或更新版本。\n当前版本：" + (provider == null ? "未检测到" : provider.versionName));
        explanation.setTextSize(16);
        explanation.setGravity(Gravity.CENTER);
        explanation.setPadding(0, padding, 0, padding);
        Button settings = new Button(this);
        settings.setText("打开 WebView 应用设置");
        settings.setOnClickListener(ignored -> {
            Intent intent = provider == null ? new Intent(Settings.ACTION_APPLICATION_SETTINGS)
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + provider.packageName));
            try { startActivity(intent); }
            catch (ActivityNotFoundException error) { toast("请在系统设置中更新或启用 WebView"); }
        });
        Button retry = new Button(this);
        retry.setText("更新后重试");
        retry.setOnClickListener(ignored -> openCompatibleWebView());
        prompt.addView(title); prompt.addView(explanation); prompt.addView(settings); prompt.addView(retry);
        frame.addView(prompt, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void createWebView() {
        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // SAF grants only user-selected content URIs.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setBackgroundColor(Color.rgb(255, 247, 234));
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        webView.setWebViewClient(new LocalClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!isTrustedForeground()) { callback.onReceiveValue(null); return true; }
                cancelFileChooser();
                fileCallback = callback;
                requestedExtensions = acceptedExtensions(params.getAcceptTypes());
                allowMultiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream", "audio/wav", "audio/x-wav"});
                try { startActivityForResult(pick, PICK_FILES); }
                catch (ActivityNotFoundException error) { cancelFileChooser(); toast("未找到系统文件选择器"); }
                return true;
            }
        });
        frame.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.loadUrl(LocalAssetPolicy.ENTRY);
    }

    private final class LocalClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String path = LocalAssetPolicy.assetPath(request.getUrl().toString());
            if (path == null || !"GET".equals(request.getMethod())) return responseError(403, "Blocked");
            try {
                String mime = LocalAssetPolicy.mimeType(path);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Referrer-Policy", "no-referrer");
                if ("text/html".equals(mime)) headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'");
                boolean text = mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
                return new WebResourceResponse(mime, text ? "UTF-8" : null, 200, "OK", headers, getAssets().open(path));
            } catch (Exception error) { return responseError(404, "Not Found"); }
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return request.isForMainFrame() ? !LocalAssetPolicy.isEntry(request.getUrl().toString())
                    : LocalAssetPolicy.assetPath(request.getUrl().toString()) == null;
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            trustedDocument = LocalAssetPolicy.isEntry(url);
            if (!trustedDocument) { view.stopLoading(); view.removeJavascriptInterface("NativeBridge"); }
        }

        @Override public void onPageFinished(WebView view, String url) {
            trustedDocument = LocalAssetPolicy.isEntry(url);
            if (activityPaused && trustedDocument) pauseAndSave();
        }
    }

    private static WebResourceResponse responseError(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    }

    private boolean isTrustedForeground() {
        return !destroyed && !activityPaused && trustedDocument && webView != null && LocalAssetPolicy.isEntry(webView.getUrl());
    }

    @Override protected void onPause() {
        super.onPause();
        activityPaused = true;
        pauseAndSave();
    }

    private void pauseAndSave() {
        if (destroyed || webView == null || webPaused) return;
        if (pendingPause != null) main.removeCallbacks(pendingPause);
        pendingPause = () -> {
            if (!destroyed && activityPaused && webView != null && !webPaused) {
                webView.onPause();
                webView.pauseTimers();
                webPaused = true;
            }
        };
        Runnable pause = pendingPause;
        if (trustedDocument) webView.evaluateJavascript(PAUSE_AND_SAVE, ignored -> { main.removeCallbacks(pause); pause.run(); });
        else pause.run();
        // A crashed/unresponsive renderer must not keep running in the background.
        main.postDelayed(pause, 400);
    }

    @Override protected void onResume() {
        super.onResume();
        activityPaused = false;
        if (pendingPause != null) main.removeCallbacks(pendingPause);
        if (webView != null) { webView.onResume(); webView.resumeTimers(); webPaused = false; }
        // Do not call wanbaApp.resume(): returning to the foreground stays paused.
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null && trustedDocument) webView.evaluateJavascript(SAVE, null);
        super.onSaveInstanceState(outState);
    }

    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (destroyed || backPending) return;
        if (webView == null || !trustedDocument) { finish(); return; }
        backPending = true;
        webView.evaluateJavascript(BACK, handled -> {
            backPending = false;
            if (!destroyed && "false".equals(handled)) {
                webView.evaluateJavascript(SAVE, ignored -> { if (!destroyed) finish(); });
            }
        });
    }

    private void cancelFileChooser() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }

    private static Set<String> acceptedExtensions(String[] types) {
        Set<String> extensions = new LinkedHashSet<>();
        if (types != null) for (String type : types) {
            for (String accept : type.toLowerCase(Locale.ROOT).split(",")) {
                if (accept.contains("json")) extensions.add("json");
                if (accept.equals(".dat")) extensions.add("dat");
                if (accept.contains("wav")) extensions.add("wav");
            }
        }
        return extensions.isEmpty() ? new LinkedHashSet<>(Arrays.asList("json", "dat", "wav")) : extensions;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILES) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback == null) return;
            if (resultCode != RESULT_OK || data == null) { callback.onReceiveValue(null); return; }
            Set<Uri> unique = new LinkedHashSet<>();
            ClipData clip = data.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) unique.add(clip.getItemAt(i).getUri());
            else if (data.getData() != null) unique.add(data.getData());
            List<Uri> selected = new ArrayList<>(unique);
            Set<String> accepted = new LinkedHashSet<>(requestedExtensions);
            if (selected.isEmpty() || selected.size() > (allowMultiple ? MAX_IMPORT_FILES : 1)) { callback.onReceiveValue(null); toast("选择的文件数量不符合要求"); return; }
            files.execute(() -> {
                try {
                    long total = 0;
                    byte[] buffer = new byte[16384];
                    for (Uri uri : selected) {
                        if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("请选择系统文件管理器中的文件");
                        String name = "";
                        long declaredSize = -1;
                        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                            if (cursor != null && cursor.moveToFirst()) { name = cursor.getString(0); if (!cursor.isNull(1)) declaredSize = cursor.getLong(1); }
                        }
                        String extension = name == null ? "" : name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
                        if (!accepted.contains(extension)) throw new IllegalArgumentException("仅支持所选类型的 JSON、DAT 或 WAV 文件");
                        long limit = extension.equals("json") ? MAX_BACKUP_BYTES : MAX_IMPORT_FILE_BYTES;
                        if (declaredSize > limit) throw new IllegalArgumentException("文件过大：JSON 最大 8MB，其他文件最大 32MB");
                        long size = 0;
                        try (InputStream input = getContentResolver().openInputStream(uri)) {
                            if (input == null) throw new IllegalArgumentException("无法读取选中的文件");
                            int bytes;
                            while ((bytes = input.read(buffer)) != -1) {
                                size += bytes; total += bytes;
                                if (size > limit || total > MAX_IMPORT_TOTAL_BYTES) throw new IllegalArgumentException("文件总大小不得超过 64MB");
                            }
                        }
                    }
                    main.post(() -> callback.onReceiveValue(destroyed ? null : selected.toArray(new Uri[0])));
                } catch (Exception error) {
                    main.post(() -> { callback.onReceiveValue(null); if (!destroyed) toast(error instanceof IllegalArgumentException ? error.getMessage() : "文件读取失败，请重新选择"); });
                }
            });
        } else if (requestCode == CREATE_BACKUP) {
            byte[] content = pendingBackup;
            pendingBackup = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) {
                backupBusy.set(false); notifyBackup("cancelled", "已取消备份"); return;
            }
            Uri output = data.getData();
            if (!"content".equals(output.getScheme())) { backupBusy.set(false); notifyBackup("error", "保存位置无效"); return; }
            files.execute(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(output, "wt")) {
                    if (stream == null) throw new IllegalArgumentException("无法打开保存位置");
                    stream.write(content); stream.flush();
                    main.post(() -> { backupBusy.set(false); notifyBackup("saved", "备份已保存"); });
                } catch (Exception error) {
                    main.post(() -> { backupBusy.set(false); notifyBackup("error", "备份保存失败，请重试"); });
                }
            });
        }
    }

    public final class NativeBridge {
        @JavascriptInterface public void saveBackup(String filename, String json) {
            if (!trustedDocument || !backupBusy.compareAndSet(false, true)) return;
            files.execute(() -> {
                try {
                    if (json == null || json.length() > MAX_BACKUP_BYTES) throw new IllegalArgumentException("备份内容过大");
                    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > MAX_BACKUP_BYTES) throw new IllegalArgumentException("备份最大支持 8MB");
                    JSONTokener tokener = new JSONTokener(json);
                    Object value = tokener.nextValue();
                    if (!(value instanceof JSONObject || value instanceof JSONArray) || tokener.nextClean() != 0) throw new IllegalArgumentException("备份必须是有效 JSON");
                    String safeName = filename == null ? "wanba-backup.json" : filename.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
                    if (safeName.length() > 80) safeName = safeName.substring(0, 80);
                    if (!safeName.toLowerCase(Locale.ROOT).endsWith(".json")) safeName += ".json";
                    String finalName = safeName;
                    main.post(() -> {
                        if (!isTrustedForeground()) { backupBusy.set(false); return; }
                        pendingBackup = bytes;
                        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                .setType("application/json").putExtra(Intent.EXTRA_TITLE, finalName);
                        try { startActivityForResult(create, CREATE_BACKUP); }
                        catch (ActivityNotFoundException error) { pendingBackup = null; backupBusy.set(false); notifyBackup("error", "未找到系统保存对话框"); }
                    });
                } catch (Exception error) {
                    main.post(() -> { backupBusy.set(false); notifyBackup("error", error instanceof IllegalArgumentException ? error.getMessage() : "备份内容无效"); });
                }
            });
        }

        @JavascriptInterface public void openDownloads() {
            main.post(() -> {
                if (!isTrustedForeground()) return;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(LocalAssetPolicy.DOWNLOADS)).addCategory(Intent.CATEGORY_BROWSABLE)); }
                catch (ActivityNotFoundException error) { toast("未找到可打开下载页的浏览器"); }
            });
        }
    }

    private void notifyBackup(String status, String message) {
        if (destroyed) return;
        toast(message);
        if (webView != null && trustedDocument) webView.evaluateJavascript(
                "window.wanbaApp?.onBackupResult(" + ("saved".equals(status) ? "true" : "false") + "," + JSONObject.quote(message) + ");window.dispatchEvent(new CustomEvent('wanba-native-backup',{detail:{status:" + JSONObject.quote(status)
                        + ",message:" + JSONObject.quote(message) + "}}))", null);
    }

    private void toast(String message) { if (!destroyed) Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    @Override protected void onDestroy() {
        destroyed = true;
        trustedDocument = false;
        main.removeCallbacksAndMessages(null);
        cancelFileChooser();
        pendingBackup = null;
        if (Build.VERSION.SDK_INT >= 33 && predictiveBack != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(predictiveBack);
        if (webView != null) {
            webView.removeJavascriptInterface("NativeBridge");
            webView.stopLoading();
            frame.removeView(webView);
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        files.shutdown();
        super.onDestroy();
    }
}
