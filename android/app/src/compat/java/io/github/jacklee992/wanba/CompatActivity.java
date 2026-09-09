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
import android.webkit.ValueCallback;
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

import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.WebRequestError;
import java.util.function.Consumer;

public final class CompatActivity extends Activity {
    private static final int PICK_FILES = 4101;
    private static final int CREATE_BACKUP = 4102;
    private static final int MAX_BACKUP_BYTES = 8 * 1024 * 1024;
    private static final long MAX_IMPORT_FILE_BYTES = 32L * 1024 * 1024;
    private static final long MAX_IMPORT_TOTAL_BYTES = 64L * 1024 * 1024;
    private static final int MAX_IMPORT_FILES = 64;
    private static GeckoRuntime runtime;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final AtomicBoolean backupBusy = new AtomicBoolean(false);
    private final Map<String, Consumer<JSONObject>> callbacks = new HashMap<>();
    // Accessed only by the files executor; retained while DOM File objects may still read them.
    private final List<CompatImportCache> importCaches = new ArrayList<>();
    private final NativeBridge nativeBridge = new NativeBridge();
    private GeckoSession session;
    private GeckoView geckoView;
    private CompatAssetServer assetServer;
    private ContentUpdateManager contentUpdates;
    private String contentEntryPath;
    private FrameLayout frame;
    private GameImmersiveController immersive;
    private WebExtension extension;
    private WebExtension.Port bridgePort;
    private volatile boolean trustedDocument;
    private boolean destroyed;
    private boolean activityPaused;
    private boolean backPending;
    private long nextCommand;
    private long pauseGeneration;
    private Runnable pendingPause;
    private ValueCallback<Uri[]> fileCallback;
    private Set<String> requestedExtensions = new LinkedHashSet<>(Arrays.asList("json", "dat", "wav"));
    private boolean allowMultiple;
    private byte[] pendingBackup;
    private OnBackInvokedCallback predictiveBack;
    private CompatChoiceDialog choiceDialog;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(255, 247, 234));
        setContentView(frame);
        immersive = new GameImmersiveController(getWindow(), frame);
        if (Build.VERSION.SDK_INT >= 33) {
            predictiveBack = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, predictiveBack);
        }
        contentUpdates = new ContentUpdateManager(this, BuildConfig.VERSION_CODE, new ContentUpdateManager.Listener() {
            @Override public void onLoad(String path) { contentEntryPath = path; loadContent(); }
            @Override public void onEvent(String event) { send(json("op", "gameUpdate", "value", event)); }
        });
        openEngine();
    }

    private void openEngine() {
        files.execute(() -> {
            try {
                CompatAssetServer server = new CompatAssetServer(path -> contentUpdates.openResource(path));
                main.post(() -> {
                    if (destroyed) { server.close(); return; }
                    assetServer = server;
                    createEngine();
                });
            } catch (Exception error) {
                main.post(() -> showStartupError("离线资源端口 38657 无法启动，请关闭占用该端口的应用后重新打开玩吧。"));
            }
        });
    }

    private void createEngine() {
        try {
            if (runtime == null) runtime = GeckoRuntime.create(getApplicationContext(),
                    new GeckoRuntimeSettings.Builder().javaScriptEnabled(true)
                            .remoteDebuggingEnabled(BuildConfig.DEBUG).consoleOutput(BuildConfig.DEBUG)
                            .configFilePath(BuildConfig.DEBUG ? null : "").build());
            session = new GeckoSession();
            session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
                @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession current, LoadRequest request) {
                    return GeckoResult.fromValue(isTrustedContentUrl(request.uri) ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
                }
                @Override public GeckoResult<AllowOrDeny> onSubframeLoadRequest(GeckoSession current, LoadRequest request) {
                    return GeckoResult.fromValue(CompatAssetServer.assetPath(request.uri) != null ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
                }
                @Override public GeckoResult<GeckoSession> onNewSession(GeckoSession current, String uri) { return null; }
                @Override public GeckoResult<String> onLoadError(GeckoSession current, String uri, WebRequestError error) {
                    if (CompatAssetServer.isEntry(uri)) showStartupError("内置引擎未能加载离线资源，请重新打开玩吧。");
                    return null;
                }
            });
            session.setPromptDelegate(new GeckoSession.PromptDelegate() {
                @Override public GeckoResult<PromptResponse> onChoicePrompt(GeckoSession current, ChoicePrompt prompt) {
                    if (!isTrustedForeground()) return GeckoResult.fromValue(prompt.dismiss());
                    if (choiceDialog == null) choiceDialog = new CompatChoiceDialog(CompatActivity.this);
                    return choiceDialog.show(prompt);
                }
                @Override public GeckoResult<PromptResponse> onFilePrompt(GeckoSession current, FilePrompt prompt) {
                    if (!isTrustedForeground() || prompt.type == FilePrompt.Type.FOLDER)
                        return GeckoResult.fromValue(prompt.dismiss());
                    cancelFileChooser();
                    GeckoResult<PromptResponse> response = new GeckoResult<>();
                    AtomicBoolean completed = new AtomicBoolean(false);
                    fileCallback = uris -> {
                        if (!completed.compareAndSet(false, true)) return;
                        response.complete(uris == null ? prompt.dismiss() : prompt.confirm(CompatActivity.this, uris));
                    };
                    requestedExtensions = acceptedExtensions(prompt.mimeTypes);
                    allowMultiple = prompt.type == FilePrompt.Type.MULTIPLE;
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream", "audio/wav", "audio/x-wav"});
                    try { startActivityForResult(pick, PICK_FILES); }
                    catch (ActivityNotFoundException error) { cancelFileChooser(); toast("未找到系统文件选择器"); }
                    return response;
                }
            });
            session.open(runtime);
            geckoView = new GeckoView(this);
            geckoView.setSession(session);
            frame.addView(geckoView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/wanba-bridge/", "wanba-local-bridge@jacklee992.github.io")
                    .accept(installed -> {
                        if (destroyed) return;
                        extension = installed;
                        session.getWebExtensionController().setMessageDelegate(installed, new WebExtension.MessageDelegate() {
                            @Override public void onConnect(WebExtension.Port port) { connectBridge(port); }
                        }, "wanba");
                        loadContent();
                        session.setActive(!activityPaused);
                        session.setFocused(!activityPaused);
                    }, error -> showStartupError("离线桥接组件未能启动，请重新打开玩吧。"));
        } catch (RuntimeException error) {
            showStartupError("内置 GeckoView 引擎启动失败，请重新打开玩吧。");
        }
    }

    private void connectBridge(WebExtension.Port port) {
        WebExtension.MessageSender sender = port.sender;
        if (destroyed || sender.session != session || !sender.isTopLevel()
                || sender.environmentType != WebExtension.MessageSender.ENV_TYPE_CONTENT_SCRIPT
                || !isTrustedContentUrl(sender.url)) { port.disconnect(); return; }
        if (bridgePort != null) bridgePort.disconnect();
        bridgePort = port;
        trustedDocument = true;
        port.setDelegate(new WebExtension.PortDelegate() {
            @Override public void onPortMessage(Object value, WebExtension.Port source) {
                if (destroyed || source != bridgePort || !isTrustedContentUrl(source.sender.url) || !(value instanceof JSONObject)) return;
                JSONObject message = (JSONObject) value;
                switch (message.optString("op")) {
                    case "ack":
                        Consumer<JSONObject> callback = callbacks.remove(message.optString("id"));
                        if (callback != null) callback.accept(message);
                        break;
                    case "ready": if (activityPaused) pauseAndSave(); break;
                    case "backup": if (isTrustedForeground()) nativeBridge.saveBackup(message.optString("filename"), message.optString("json")); break;
                    case "immersive":
                        if (message.opt("enabled") instanceof Boolean) {
                            boolean enabled = message.optBoolean("enabled");
                            if (isTrustedForeground() || (!enabled && trustedDocument)) immersive.request(enabled);
                        }
                        break;
                    case "downloads": if (isTrustedForeground()) nativeBridge.openDownloads(); break;
                    case "info":
                        send(json("op", "infoResult", "id", message.optString("id"), "value", nativeBridge.getAppInfo()));
                        break;
                    case "contentState": contentReply(message, contentUpdates.getContentState()); break;
                    case "contentReady": contentReply(message, contentUpdates.reportGameContentReady(message.optString("snapshotId"))); break;
                    case "checkUpdate": contentReply(message, isTrustedForeground() ? contentUpdates.checkGameUpdates() : "{\"error\":\"页面不可用\"}"); break;
                    case "downloadUpdate": contentReply(message, isTrustedForeground() ? contentUpdates.downloadGameUpdate(message.optString("snapshotId")) : "{\"error\":\"页面不可用\"}"); break;
                    case "activateUpdate": contentReply(message, isTrustedForeground() ? contentUpdates.activateGameUpdate(message.optString("snapshotId"), message.optString("checkpoint")) : "{\"error\":\"页面不可用\"}"); break;
                    case "rollbackUpdate": contentReply(message, isTrustedForeground() ? contentUpdates.rollbackGameUpdate() : "{\"error\":\"页面不可用\"}"); break;
                    default: break;
                }
            }
            @Override public void onDisconnect(WebExtension.Port source) {
                if (source == bridgePort) { bridgePort = null; trustedDocument = false; immersive.reset(); }
            }
        });
    }

    private static JSONObject json(Object... fields) {
        JSONObject value = new JSONObject();
        try { for (int i = 0; i < fields.length; i += 2) value.put((String) fields[i], fields[i + 1]); }
        catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
        return value;
    }

    private void contentReply(JSONObject request, String value) { send(json("op", "contentResult", "id", request.optString("id"), "value", value)); }

    private boolean isTrustedContentUrl(String url) {
        return url != null && url.startsWith(CompatAssetServer.ORIGIN + "/")
                && contentUpdates.isTrustedEntry(LocalAssetPolicy.ORIGIN + url.substring(CompatAssetServer.ORIGIN.length()));
    }

    private void loadContent() {
        if (destroyed || session == null || extension == null || contentEntryPath == null) return;
        immersive.reset();
        trustedDocument = false;
        session.loadUri(CompatAssetServer.ORIGIN + contentEntryPath);
    }

    private void send(JSONObject message) { if (!destroyed && bridgePort != null) bridgePort.postMessage(message); }

    private void command(String operation, Consumer<JSONObject> callback) {
        if (destroyed || bridgePort == null) { if (callback != null) callback.accept(null); return; }
        String id = "native-" + (++nextCommand);
        if (callback != null) {
            callbacks.put(id, callback);
            main.postDelayed(() -> { Consumer<JSONObject> pending = callbacks.remove(id); if (pending != null) pending.accept(null); }, 1500);
        }
        send(json("op", operation, "id", id));
    }

    private boolean isTrustedForeground() { return !destroyed && !activityPaused && trustedDocument && session != null && bridgePort != null; }

    private void showStartupError(String message) {
        if (destroyed) return;
        immersive.reset();
        TextView error = new TextView(this);
        error.setText(message);
        error.setTextSize(18);
        error.setGravity(Gravity.CENTER);
        int inset = Math.round(28 * getResources().getDisplayMetrics().density);
        error.setPadding(inset, inset, inset, inset);
        frame.removeAllViews(); frame.addView(error);
    }

    @Override protected void onPause() { super.onPause(); activityPaused = true; if (immersive != null) immersive.foreground(false); if (choiceDialog != null) choiceDialog.dismiss(); if (contentUpdates != null) contentUpdates.onPause(); pauseAndSave(); }

    private void pauseAndSave() {
        if (destroyed || session == null) return;
        long generation = ++pauseGeneration;
        if (pendingPause != null) main.removeCallbacks(pendingPause);
        pendingPause = () -> {
            if (!destroyed && generation == pauseGeneration && activityPaused && session != null) {
                session.setFocused(false); session.setActive(false);
            }
        };
        Runnable pause = pendingPause;
        command("pause", result -> { main.removeCallbacks(pause); pause.run(); });
        main.postDelayed(pause, 400);
    }

    @Override protected void onResume() {
        super.onResume(); activityPaused = false; if (immersive != null) immersive.foreground(true);
        if (contentUpdates != null) contentUpdates.onResume();
        pauseGeneration++;
        if (pendingPause != null) main.removeCallbacks(pendingPause);
        if (session != null) { session.setActive(true); session.setFocused(true); }
        // The game remains paused until the user chooses Continue.
    }

    @Override protected void onSaveInstanceState(Bundle state) { command("save", null); super.onSaveInstanceState(state); }
    // Android 32 and earlier fallback; API 33+ uses the registered OnBackInvokedDispatcher.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (choiceDialog != null && choiceDialog.isShowing()) { choiceDialog.dismiss(); return; }
        if (destroyed || backPending) return;
        if (session == null || !trustedDocument) { finish(); return; }
        backPending = true;
        command("back", result -> {
            backPending = false;
            if (destroyed) return;
            if (result != null && result.optBoolean("ok") && !result.optBoolean("handled")) finish();
            else if (result == null || !result.optBoolean("ok")) toast("页面仍在响应，请稍后再试");
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
                CompatImportCache cache = null;
                try {
                    cache = new CompatImportCache(getCacheDir());
                    List<Uri> readable = new ArrayList<>();
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
                        try (InputStream input = getContentResolver().openInputStream(uri)) {
                            if (input == null) throw new IllegalArgumentException("无法读取选中的文件");
                            readable.add(Uri.fromFile(cache.copy(input, name, limit)));
                        }
                    }
                    importCaches.add(cache);
                    main.post(() -> callback.onReceiveValue(destroyed ? null : readable.toArray(new Uri[0])));
                } catch (Exception error) {
                    if (cache != null) cache.close();
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
        public String getAppInfo() {
            if (!trustedDocument) return "{}";
            JSONObject info = new JSONObject();
            try {
                info.put("appVersion", BuildConfig.VERSION_NAME);
                info.put("versionCode", BuildConfig.VERSION_CODE);
                info.put("flavor", "compat");
                info.put("engine", "GeckoView");
                info.put("engineVersion", org.mozilla.geckoview.BuildConfig.MOZ_APP_VERSION);
                info.put("providerVersion", org.mozilla.geckoview.BuildConfig.MOZ_APP_VERSION
                        + " (" + org.mozilla.geckoview.BuildConfig.MOZ_APP_BUILDID + ")");
            } catch (org.json.JSONException ignored) { }
            return info.toString();
        }

        public void saveBackup(String filename, String json) {
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

        public void openDownloads() {
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
        send(json("op", "backupResult", "success", "saved".equals(status), "message", message));
    }

    private void toast(String message) { if (!destroyed) Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    @Override protected void onDestroy() {
        if (choiceDialog != null) choiceDialog.dismiss();
        destroyed = true;
        if (immersive != null) immersive.destroy();
        if (contentUpdates != null) contentUpdates.close();
        trustedDocument = false;
        main.removeCallbacksAndMessages(null);
        callbacks.clear();
        cancelFileChooser();
        pendingBackup = null;
        if (Build.VERSION.SDK_INT >= 33 && predictiveBack != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(predictiveBack);
        if (bridgePort != null) { bridgePort.disconnect(); bridgePort = null; }
        if (session != null) {
            if (extension != null) session.getWebExtensionController().setMessageDelegate(extension, null, "wanba");
            session.setActive(false); session.stop(); session.close(); session = null;
        }
        if (assetServer != null) { assetServer.close(); assetServer = null; }
        frame.removeAllViews();
        files.execute(() -> { for (CompatImportCache cache : importCaches) cache.close(); importCaches.clear(); });
        files.shutdown();
        super.onDestroy();
    }
}
