package io.github.jacklee992.wanba;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** One serialized update transaction per host. Network, hashing and disk work stay off the UI. */
public final class ContentUpdateManager implements AutoCloseable {
    public interface Listener { void onLoad(String entryPath); void onEvent(String json); }
    private interface Work { void run() throws Exception; }
    private static final String CHANNEL = "https://github.com/" + ContentManifest.REPOSITORY + "/releases/latest/download/channel.json";
    private static final Set<String> STORAGE_KEYS = new HashSet<>(Arrays.asList("wanbanXiaowu_settings_v1", "wanbanXiaowu_scores_v1", "wanbanXiaowu_progress_v1", "wanbanXiaowu_records_v1", "wanbanXiaowu_sudokuState_v1"));
    private final Context context;
    private final int appVersionCode;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final AtomicLong ids = new AtomicLong();
    private volatile Listener listener;
    private volatile ContentResourceStore store;
    private volatile String activeId = "builtin", pendingId, stateJson = "{}";
    private volatile boolean closed, foreground = true;
    private ContentManifest candidate;
    private JSONObject persisted = new JSONObject(), job;
    private long lastCheck;
    private Runnable watchdog;

    public ContentUpdateManager(Context context, int versionCode, Listener listener) {
        this.context = context.getApplicationContext(); appVersionCode = versionCode; this.listener = listener;
        work.execute(() -> {
            try {
                store = new ContentResourceStore(this.context, versionCode);
                try { persisted = new JSONObject(new String(ContentResourceStore.readAtomic(new File(store.directory, "active.json"), 32768), StandardCharsets.UTF_8)); }
                catch (IOException absent) { persisted = object("active", store.builtinId()); }
                String current = persisted.optString("active", store.builtinId());
                if (persisted.optBoolean("pending")) {
                    String failed = current;
                    current = persisted.optString("previous", store.builtinId());
                    persisted.put("active", current).put("pending", false).put("restore", true).put("failed", failed);
                }
                try { store.loadInstalled(current); }
                catch (Exception bad) {
                    current = store.builtinId(); persisted.put("active", current).put("pending", false);
                }
                String previous = persisted.optString("previous");
                if (!previous.isEmpty()) try { store.loadInstalled(previous); } catch (Exception bad) { persisted.remove("previous"); }
                activeId = current; saveState();
                File cached = new File(store.directory, "candidate.json");
                if (cached.isFile()) try (InputStream input = new FileInputStream(cached)) {
                    ContentManifest found = ContentManifest.parse(ContentResourceStore.read(input, 4 * 1024 * 1024), store.publicKey, appVersionCode);
                    requireFreshSequence(found);
                    found.requireSaveCompatibility(store.get(activeId));
                    if (!found.id.equals(activeId) && !found.id.equals(persisted.optString("failed"))) candidate = found;
                    try { store.loadInstalled(found.id); } catch (Exception notReady) { }
                } catch (Exception invalid) { cached.delete(); }
                refresh(); loadCurrent();
            } catch (Exception error) {
                job = object("jobId", "startup", "action", "initialize", "state", "error", "message", "内容更新暂不可用：" + message(error));
                refresh(); postLoad("/assets/www/standalone/index.html");
            }
        });
    }

    public String getContentState() { return stateJson; }
    public String checkGameUpdates() {
        return submit("check", () -> {
            if (System.currentTimeMillis() - lastCheck < 30000 && candidate != null) { status(store.installed(candidate.id) ? "ready" : "available", "已有可用更新", 0, missingBytes(candidate)); return; }
            status("checking", "正在检查游戏内容", 0, 0);
            byte[] envelope;
            HttpURLConnection connection = connect(CHANNEL);
            try (InputStream input = connection.getInputStream()) { envelope = ContentResourceStore.read(input, 4 * 1024 * 1024); }
            finally { connection.disconnect(); }
            ContentManifest manifest = ContentManifest.parse(envelope, store.publicKey, appVersionCode);
            requireFreshSequence(manifest);
            manifest.requireSaveCompatibility(store.get(activeId));
            persisted.put("highest", manifest.sequence).put("highestId", manifest.id); saveState(); lastCheck = System.currentTimeMillis();
            if (manifest.id.equals(activeId)) { candidate = null; status("upToDate", "游戏内容已是最新", 0, 0); return; }
            if (manifest.id.equals(persisted.optString("failed"))) throw new IOException("该版本上次启动未成功，请等待修复版本");
            candidate = manifest; ContentResourceStore.writeAtomic(new File(store.directory, "candidate.json"), envelope);
            status(store.installed(manifest.id) ? "ready" : "available", "发现可用的游戏内容更新", 0, missingBytes(manifest));
        });
    }

    public String downloadGameUpdate(String snapshotId) {
        return submit("download", () -> {
            ContentManifest manifest = requireCandidate(snapshotId);
            long total = missingBytes(manifest), done = 0, expanded = 0;
            for (ContentManifest.Pack pack : manifest.packages.values()) if (!store.hasPack(pack)) for (ContentManifest.FileRef file : pack.files) expanded += file.size;
            if (store.directory.getUsableSpace() < total + expanded + 32L * 1024 * 1024) throw new IOException("可用空间不足，请清理空间后重试");
            status("downloading", "正在下载变化的资源包", 0, total);
            for (ContentManifest.Pack pack : manifest.packages.values()) {
                if (store.hasPack(pack)) continue;
                File archive = new File(store.directory, ".download-" + pack.sha256 + ".part");
                long offset = done;
                try {
                    download(pack, archive, offset, total);
                    store.unpack(pack, archive); done += pack.size;
                } finally { archive.delete(); }
            }
            store.installSnapshot(manifest);
            collect();
            status("ready", "下载完成，回到首页后可安装", done, total);
        });
    }

    public String activateGameUpdate(String snapshotId, String checkpointJson) {
        return submit("activate", () -> {
            ContentManifest manifest = requireCandidate(snapshotId);
            if (!store.installed(manifest.id)) throw new IOException("请先完整下载更新");
            store.installSnapshot(manifest);
            manifest.requireSaveCompatibility(store.get(activeId));
            JSONObject storage = validateCheckpoint(checkpointJson);
            ContentResourceStore.writeAtomic(new File(store.directory, "checkpoint.json"), storage.toString().getBytes(StandardCharsets.UTF_8));
            JSONObject next = new JSONObject(persisted.toString());
            next.put("previous", activeId).put("active", manifest.id).put("pending", true).put("restore", false);
            ContentResourceStore.writeAtomic(new File(store.directory, "active.json"), next.toString().getBytes(StandardCharsets.UTF_8));
            persisted = next; activeId = manifest.id; pendingId = activeId;
            status("activating", "正在切换已验证的内容", 0, 0); loadCurrent();
        });
    }

    public String rollbackGameUpdate() {
        return submit("rollback", () -> rollback(false));
    }

    public String reportGameContentReady(String snapshotId) {
        if (!activeId.equals(snapshotId) || closed) return object("error", "当前入口与快照不符").toString();
        work.execute(() -> {
            try {
                if (!activeId.equals(snapshotId)) return;
                JSONObject next = new JSONObject(persisted.toString()).put("pending", false).put("restore", false);
                ContentResourceStore.writeAtomic(new File(store.directory, "active.json"), next.toString().getBytes(StandardCharsets.UTF_8));
                persisted = next; pendingId = null;
                collect();
                status("active", "游戏内容已就绪", 0, 0);
            } catch (Exception error) { status("error", message(error), 0, 0); }
        });
        return object("accepted", true).toString();
    }

    private void rollback(boolean startupFailure) throws Exception {
        String previous = persisted.optString("previous", store.builtinId());
        if (previous.equals(activeId)) throw new IOException("没有可回退的内容版本");
        if (!startupFailure && previous.equals(persisted.optString("failed"))) throw new IOException("该版本上次启动失败，请等待修复版本");
        ContentManifest target = store.loadInstalled(previous);
        if (!startupFailure && target != null) target.requireSaveCompatibility(store.get(activeId));
        String failed = activeId;
        JSONObject next = new JSONObject(persisted.toString()).put("active", previous).put("previous", failed).put("restore", startupFailure).put("pending", false);
        if (startupFailure) next.put("failed", failed);
        ContentResourceStore.writeAtomic(new File(store.directory, "active.json"), next.toString().getBytes(StandardCharsets.UTF_8));
        persisted = next;
        if (startupFailure && candidate != null && candidate.id.equals(failed)) candidate = null;
        activeId = previous; pendingId = null;
        status("rolledBack", startupFailure ? "新版内容未能启动，已恢复上一版本和更新前存档" : "已回到上一内容版本，当前存档保留", 0, 0);
        loadCurrent();
    }

    private String submit(String action, Work operation) {
        if (closed || store == null) return object("error", "更新器尚未就绪").toString();
        if (!busy.compareAndSet(false, true)) return object("error", "已有更新操作正在进行").toString();
        String id = "update-" + System.currentTimeMillis() + "-" + ids.incrementAndGet();
        work.execute(() -> {
            job = object("jobId", id, "action", action, "state", "starting", "downloadedBytes", 0, "totalBytes", 0, "message", "");
            try { operation.run(); }
            catch (Exception error) { status("error", message(error), 0, 0); }
            finally { busy.set(false); }
        });
        return object("jobId", id).toString();
    }

    private ContentManifest requireCandidate(String id) throws IOException {
        if (id != null && id.equals(persisted.optString("failed"))) throw new IOException("该版本上次启动失败，请等待修复版本");
        if (candidate == null || id == null || !candidate.id.equals(id)) throw new IOException("更新候选已变化，请重新检查");
        return candidate;
    }
    private void requireFreshSequence(ContentManifest manifest) throws IOException {
        long bundledSequence = store.builtin == null ? 0 : store.builtin.sequence;
        long highest = Math.max(persisted.optLong("highest", 0), bundledSequence);
        String highestId = persisted.optLong("highest", 0) >= bundledSequence ? persisted.optString("highestId", "") : store.builtin.id;
        if (manifest.sequence < highest || (manifest.sequence == highest && !highestId.isEmpty() && !manifest.id.equals(highestId)))
            throw new IOException("拒绝过旧或重复发布序号的内容");
    }
    private long missingBytes(ContentManifest manifest) { long size = 0; for (ContentManifest.Pack pack : manifest.packages.values()) if (!store.hasPack(pack)) size += pack.size; return size; }

    private void download(ContentManifest.Pack pack, File output, long previous, long total) throws Exception {
        HttpURLConnection connection = connect(pack.url); long received = 0, notified = 0;
        try (InputStream input = connection.getInputStream(); FileOutputStream stream = new FileOutputStream(output)) {
            if (connection.getContentLengthLong() > pack.size) throw new IOException("下载长度不符");
            byte[] buffer = new byte[32768]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (closed || Thread.currentThread().isInterrupted()) throw new IOException("下载已停止");
                received += count; if (received > pack.size) throw new IOException("下载内容过大");
                stream.write(buffer, 0, count);
                if (received - notified >= 256 * 1024) { notified = received; status("downloading", "正在下载 " + pack.id, previous + received, total); }
            }
            stream.getFD().sync();
            if (received != pack.size) throw new IOException("下载不完整，请重试");
        } finally { connection.disconnect(); }
    }

    private static HttpURLConnection connect(String start) throws Exception {
        if (!(start.equals(CHANNEL) || ContentManifest.validArchiveUrl(start, Integer.MAX_VALUE))) throw new IOException("下载来源无效");
        URI current = new URI(start);
        for (int redirects = 0; redirects <= 5; redirects++) {
            if (!safeRedirect(current)) throw new IOException("下载跳转离开了受信任的 GitHub 发布服务");
            HttpURLConnection connection = (HttpURLConnection) current.toURL().openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "Wanba-Content-Updater/1"); connection.setRequestProperty("Accept-Encoding", "identity");
            int code = connection.getResponseCode();
            if (code == 200) return connection;
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String next = connection.getHeaderField("Location"); connection.disconnect();
                if (next == null) throw new IOException("下载跳转无效"); current = current.resolve(next); continue;
            }
            connection.disconnect(); throw new IOException(code == 403 || code == 429 ? "GitHub 暂时限制请求，请稍后再试" : "GitHub 下载失败（" + code + "），已保留离线内容");
        }
        throw new IOException("下载跳转次数过多");
    }

    static boolean safeRedirect(URI uri) {
        if (!"https".equals(uri.getScheme()) || uri.getPort() != -1 || uri.getRawUserInfo() != null || uri.getRawFragment() != null) return false;
        String host = uri.getHost();
        if ("release-assets.githubusercontent.com".equals(host) || "objects.githubusercontent.com".equals(host)) return true;
        if (!"github.com".equals(host) || uri.getRawQuery() != null) return false;
        String path = uri.getRawPath(), prefix = "/" + ContentManifest.REPOSITORY + "/releases/";
        return path.equals(prefix + "latest/download/channel.json") || path.matches(java.util.regex.Pattern.quote(prefix) + "download/content-[1-9][0-9]{0,9}/[A-Za-z0-9][A-Za-z0-9._-]{0,154}");
    }

    private static JSONObject validateCheckpoint(String json) throws Exception {
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > 8 * 1024 * 1024) throw new IOException("更新前存档过大");
        JSONObject value = new JSONObject(json);
        if (!Boolean.TRUE.equals(value.opt("ok")) || !Boolean.TRUE.equals(value.opt("idle"))) throw new IOException("请先回到首页并保存游戏");
        JSONObject storage = value.getJSONObject("storage");
        if (storage.length() != STORAGE_KEYS.size()) throw new IOException("更新存档检查点不完整");
        for (String key : STORAGE_KEYS) {
            if (!storage.has(key) || !(storage.isNull(key) || storage.get(key) instanceof String)) throw new IOException("更新存档检查点无效");
        }
        return storage;
    }

    public InputStream openResource(String path) throws IOException { return store == null ? context.getAssets().open(path) : store.openPath(path); }
    public boolean isTrustedEntry(String url) {
        String path = LocalAssetPolicy.assetPath(url);
        return path != null && ("/assets/" + path).equals(store == null ? "/assets/www/standalone/index.html" : store.entryPath(activeId));
    }
    private void loadCurrent() { postLoad(store.entryPath(activeId)); if (pendingId != null) main.post(this::armWatchdog); }
    private void postLoad(String path) { main.post(() -> { Listener target = listener; if (!closed && target != null) target.onLoad(path); }); }

    public void onPause() { foreground = false; if (watchdog != null) main.removeCallbacks(watchdog); }
    public void onResume() { foreground = true; armWatchdog(); }
    private void armWatchdog() {
        if (watchdog != null) main.removeCallbacks(watchdog);
        String expected = pendingId;
        if (closed || !foreground || expected == null) return;
        watchdog = () -> {
            if (closed || !foreground || !expected.equals(pendingId)) return;
            work.execute(() -> { try { if (expected.equals(pendingId)) rollback(true); } catch (Exception error) { status("error", message(error), 0, 0); } });
        };
        main.postDelayed(watchdog, 30000);
    }

    private void saveState() throws Exception { ContentResourceStore.writeAtomic(new File(store.directory, "active.json"), persisted.toString().getBytes(StandardCharsets.UTF_8)); }
    private void collect() {
        Set<String> keep = new HashSet<>(Arrays.asList(activeId, store.builtinId(), persisted.optString("previous", "")));
        if (candidate != null) keep.add(candidate.id);
        store.collect(keep);
    }
    private void status(String state, String message, long received, long total) {
        if (job == null) job = object("jobId", "state", "action", "state");
        try { job.put("state", state).put("message", message).put("downloadedBytes", received).put("totalBytes", total); } catch (Exception ignored) { }
        refresh(); String event = job.toString();
        main.post(() -> { Listener target = listener; if (!closed && target != null) target.onEvent(event); });
    }
    private void refresh() {
        try {
            ContentManifest active = store == null ? null : store.get(activeId);
            JSONObject state = object("hostApi", ContentManifest.HOST_API, "appVersionCode", appVersionCode, "repository", ContentManifest.REPOSITORY,
                    "activeSnapshotId", activeId, "active", active == null ? JSONObject.NULL : active.summary(),
                    "candidate", candidate == null || candidate.id.equals(activeId) ? JSONObject.NULL : candidate.summary(),
                    "candidateReady", candidate != null && store != null && store.installed(candidate.id),
                    "bootHealthy", !persisted.optBoolean("pending") && !persisted.optBoolean("restore"),
                    "previousSnapshotId", persisted.opt("previous"), "job", job, "restoreStorage", JSONObject.NULL);
            if (store != null && persisted.optBoolean("restore")) state.put("restoreStorage", new JSONObject(new String(ContentResourceStore.readAtomic(new File(store.directory, "checkpoint.json"), 8 * 1024 * 1024), StandardCharsets.UTF_8)));
            stateJson = state.toString();
        } catch (Exception error) { stateJson = object("hostApi", ContentManifest.HOST_API, "activeSnapshotId", activeId, "bootHealthy", false, "error", message(error)).toString(); }
    }
    private static JSONObject object(Object... values) { JSONObject result = new JSONObject(); try { for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1] == null ? JSONObject.NULL : values[i + 1]); } catch (Exception impossible) { throw new IllegalArgumentException(impossible); } return result; }
    private static String message(Exception error) { String value = error.getMessage(); return value == null || value.length() > 200 ? "操作未完成，请重试" : value; }
    @Override public void close() { closed = true; listener = null; if (watchdog != null) main.removeCallbacks(watchdog); work.shutdownNow(); }
}
