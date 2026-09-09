package io.github.jacklee992.wanba.appupdater;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** This module never reads, migrates, or deletes game data. Every transaction owns its own files. */
final class UpdateController implements AutoCloseable {
    private static final java.util.Set<String> ACTIVE_DIRECTORIES = new java.util.HashSet<>();
    interface Listener { void event(String state, String message); }
    interface Work { void run() throws Exception; }
    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(), cancelled = new AtomicBoolean();
    private final UpdateHttp http = new UpdateHttp();
    private final File directory, manifestFile, fullFile;
    private final SharedPreferences prefs;
    private byte[] trust, envelope;
    private UpdateProtocol checked;
    private volatile boolean closed;
    private volatile boolean ready;

    UpdateController(Context c, Listener listener) throws Exception {
        context = c.getApplicationContext(); this.listener = listener;
        File root = new File(context.getNoBackupFilesDir(), "app-updater");
        directory = new File(root, UUID.randomUUID().toString());
        synchronized (ACTIVE_DIRECTORIES) {
            File[] stale = root.listFiles();
            if (stale != null) for (File child : stale) {
                if (child.getName().matches("[0-9a-f-]{36}") && !ACTIVE_DIRECTORIES.contains(child.getAbsolutePath())) removeTransaction(child);
            }
            UpdateProtocol.require(directory.mkdirs(), "Cannot create private update staging");
            ACTIVE_DIRECTORIES.add(directory.getAbsolutePath());
        }
        manifestFile = new File(directory, "app-updates.json"); fullFile = new File(directory, "ready.apk");
        prefs = context.getSharedPreferences("wanba_app_updater", Context.MODE_PRIVATE);
        try (InputStream in = context.getAssets().open("app-updater/public-key.der")) { trust = UpdateFiles.read(in, 2048); }
        catch (Exception e) { removeTransaction(directory); synchronized(ACTIVE_DIRECTORIES) { ACTIVE_DIRECTORIES.remove(directory.getAbsolutePath()); } worker.shutdown(); throw e; }
    }
    boolean isReady() { return ready; }
    void check() { submit(() -> {
        ready = false; checked = null; fullFile.delete(); emit("checking", "正在检查 App 版本…");
        http.download(UpdateProtocol.CHANNEL, manifestFile, -1, UpdateProtocol.MAX_MANIFEST, cancelled, (d,t) -> {});
        envelope = UpdateFiles.read(manifestFile, UpdateProtocol.MAX_MANIFEST);
        UpdateProtocol candidate = parse();
        highWater(candidate, true);
        PackageInfo current = ApkChecks.installed(context);
        if (candidate.entry.versionCode <= ApkChecks.version(current)) { emit("current", "App 已是最新版本"); return; }
        UpdateProtocol.require(candidate.entry.minSdk <= Build.VERSION.SDK_INT && candidate.entry.signer.equals(ApkChecks.signer(current)), "This release does not match the device or application signer");
        UpdateProtocol.require(current.applicationInfo.splitSourceDirs == null || current.applicationInfo.splitSourceDirs.length == 0, "Split/Play installation must update through its store");
        checked = candidate; emit("available", "发现 App " + candidate.entry.versionName + "。完整安装包 " + mib(candidate.entry.full.size) + " MiB；下载时优先使用匹配的增量包。");
    }); }
    void download() { submit(() -> {
        UpdateProtocol.require(checked != null, "Check for an update first");
        UpdateProtocol manifest = parse(); UpdateProtocol.Entry entry = manifest.entry; ready = false;
        PackageInfo current = ApkChecks.installed(context);
        UpdateProtocol.require(entry.versionCode > ApkChecks.version(current), "Application already updated");
        long maxPatch = 0; for (UpdateProtocol.Delta d : entry.deltas) maxPatch = Math.max(maxPatch, d.asset.size);
        // Includes a full output, patch, installer session copy and a modest filesystem reserve.
        UpdateProtocol.require(directory.getUsableSpace() >= entry.full.size * 2 + maxPatch + 32L * 1024 * 1024, "Not enough free storage for safe reconstruction and installation");
        File base = new File(current.applicationInfo.sourceDir), patch = new File(directory, "patch.part"), output = new File(directory, "apk.part");
        DownloadAccounting traffic = new DownloadAccounting();
        boolean patched = false;
        for (UpdateProtocol.Delta delta : entry.deltas) {
            if (delta.baseVersion != ApkChecks.version(current)) continue;
            emit("verifying", "正在核对本机旧 APK…");
            if (!UpdateFiles.hash(base, cancelled).equals(delta.baseHash)) continue;
            try {
                traffic.patchAttempted = true;
                fetch(delta.asset, patch, "downloading", "下载增量包", traffic, true);
                emit("reconstructing", "正在重建完整签名 APK…");
                UpdateFiles.reconstruct(base, patch, output, entry.full.size, cancelled);
                ApkChecks.verify(context, output, entry, cancelled); patched = true;
            } catch (UpdateFiles.Cancelled e) { throw e; }
            catch (Exception e) { UpdateFiles.check(cancelled); emit("fallback", "增量包不可用，改为下载完整 APK。"); output.delete(); }
            finally { patch.delete(); }
            break;
        }
        if (!patched) { fetch(entry.full, output, "downloading", "下载完整 APK", traffic, false); emit("verifying", "正在验证完整 APK 签名…"); ApkChecks.verify(context, output, entry, cancelled); }
        UpdateFiles.check(cancelled); fullFile.delete(); UpdateProtocol.require(output.renameTo(fullFile), "Cannot finalize APK");
        ready = true; emit("ready", traffic.summary(patched, entry.full.size) + "\nAPK 验证通过。安装将由 Android 系统再次确认；游戏数据保留。");
    }); }
    void install() { submit(() -> {
        UpdateProtocol.require(ready, "Download and verify the APK first");
        UpdateProtocol manifest = parse();
        emit("verifying", "安装前再次验证 APK…"); ApkChecks.verify(context, fullFile, manifest.entry, cancelled);
        UpdateFiles.check(cancelled);
        UpdateProtocol.require(context.getPackageManager().canRequestPackageInstalls(), "请先允许此 App 安装未知应用，再点安装");
        InstallResultReceiver.install(context, fullFile, manifest.entry, cancelled);
        emit("installing", "已交给 Android 安装器，请确认系统安装提示。");
    }); }
    private UpdateProtocol parse() throws Exception {
        UpdateProtocol candidate = new UpdateProtocol(envelope, trust, context.getPackageName(), System.currentTimeMillis() / 1000);
        highWater(candidate, false); return candidate;
    }
    private void highWater(UpdateProtocol candidate, boolean record) throws Exception {
        synchronized (UpdateController.class) {
            UpdateProtocol.checkSequence(candidate, prefs.getLong("sequence", 0), prefs.getString("payloadHash", ""));
            if (record) UpdateProtocol.require(prefs.edit().putLong("sequence", candidate.sequence).putString("payloadHash", candidate.payloadHash).commit(), "Cannot persist release sequence");
        }
    }
    private void fetch(UpdateProtocol.Asset asset, File out, String state, String title, DownloadAccounting traffic, boolean patch) throws Exception {
        emit(state, title + "（" + mib(asset.size) + " MiB）…");
        long[] last = {0};
        http.download(asset.url, out, asset.size, asset.size, cancelled, (done,total) -> {
            traffic.received(patch, done);
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - last[0] >= 400) { last[0] = now; emit(state, title + " " + Math.min(100, done * 100 / total) + "%（" + mib(done) + " / " + mib(total) + " MiB）"); }
        });
        UpdateProtocol.require(UpdateFiles.hash(out, cancelled).equals(asset.hash), "Downloaded asset hash mismatch");
    }
    void cancel() { synchronized (cancelled) { cancelled.set(true); } http.disconnect(); }
    private void submit(Work work) {
        if (closed || !busy.compareAndSet(false, true)) return;
        cancelled.set(false);
        worker.execute(() -> { try { work.run(); } catch (Exception e) { emit(cancelled.get() || e instanceof UpdateFiles.Cancelled ? "cancelled" : "error", cancelled.get() ? "已取消，当前 App 保持不变。" : e.getMessage()); }
            finally { busy.set(false); if (!ready) { new File(directory,"apk.part").delete(); new File(directory,"patch.part").delete(); } } });
    }
    private void emit(String state, String message) { main.post(() -> { if (!closed) listener.event(state, message == null ? state : message); }); }
    private static String mib(long n) { return String.format(java.util.Locale.ROOT, "%.1f", n / 1048576.0); }
    @Override public void close() {
        if (closed) return; closed = true; cancel();
        worker.execute(() -> { removeTransaction(directory); synchronized(ACTIVE_DIRECTORIES) { ACTIVE_DIRECTORIES.remove(directory.getAbsolutePath()); } });
        worker.shutdown();
    }
    private static void removeTransaction(File transaction) {
        // Only known files immediately beneath our own UUID staging directories; never recurse.
        for (String name : new String[]{"app-updates.json", "ready.apk", "patch.part", "apk.part"}) new File(transaction, name).delete();
        transaction.delete();
    }
}
