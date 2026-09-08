package io.github.jacklee992.wanba;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Immutable verified packages, isolated from user saves and SAF imports. */
public final class ContentResourceStore {
    public final File directory;
    public final byte[] publicKey;
    public final ContentManifest builtin;
    private final AssetManager assets;
    private final int appVersionCode;
    private final Map<String, ContentManifest> snapshots = new ConcurrentHashMap<>();

    public ContentResourceStore(Context context, int versionCode) throws Exception {
        assets = context.getAssets(); appVersionCode = versionCode;
        directory = new File(context.getNoBackupFilesDir(), "content-update");
        mkdir(directory); mkdir(new File(directory, "objects")); mkdir(new File(directory, "snapshots"));
        try (InputStream input = assets.open("content-update/public-key.der")) { publicKey = read(input, 1024); }
        ContentManifest bundled = null;
        try (InputStream input = assets.open("content-update/builtin-channel.json")) {
            bundled = ContentManifest.parse(read(input, 4 * 1024 * 1024), publicKey, versionCode);
            snapshots.put(bundled.id, bundled);
        } catch (java.io.FileNotFoundException absent) { /* The 1.1 baseline has no content manifest. */ }
        builtin = bundled;
    }

    public String builtinId() { return builtin == null ? "builtin" : builtin.id; }
    public ContentManifest get(String id) { return snapshots.get(id); }
    public boolean installed(String id) { return id.equals(builtinId()) || snapshots.containsKey(id); }

    public ContentManifest loadInstalled(String id) throws Exception {
        if (id.equals(builtinId())) return builtin;
        if (!id.matches("[0-9a-f]{64}")) throw new IOException("无效的快照标识");
        File folder = new File(directory, "snapshots/" + id);
        if (!new File(folder, "ready").isFile()) throw new IOException("更新快照尚未安装");
        ContentManifest manifest;
        try (InputStream input = new FileInputStream(new File(folder, "channel.json"))) { manifest = ContentManifest.parse(read(input, 4 * 1024 * 1024), publicKey, appVersionCode); }
        if (!manifest.id.equals(id)) throw new IOException("快照摘要不符");
        verifySnapshot(manifest);
        snapshots.put(id, manifest); return manifest;
    }

    public boolean hasPack(ContentManifest.Pack pack) {
        if (isBuiltinPack(pack)) return true;
        return hasStoredPack(pack);
    }

    private boolean hasStoredPack(ContentManifest.Pack pack) {
        File folder = new File(directory, "objects/" + pack.sha256);
        if (!new File(folder, ".ready").isFile()) return false;
        for (ContentManifest.FileRef file : pack.files) {
            File path = new File(folder, file.path);
            try { if (!path.isFile() || path.length() != file.size || !digest(path).equals(file.sha256)) return false; }
            catch (Exception damaged) { return false; }
        }
        return true;
    }

    private boolean isBuiltinPack(ContentManifest.Pack pack) {
        if (builtin == null) return false;
        ContentManifest.Pack original = builtin.packages.get(pack.id);
        if (original == null || !original.sha256.equals(pack.sha256) || original.files.size() != pack.files.size()) return false;
        for (ContentManifest.FileRef file : pack.files) {
            ContentManifest.FileRef old = builtin.files.get(file.path);
            if (old == null || old.size != file.size || !old.sha256.equals(file.sha256)) return false;
        }
        return true;
    }

    public void unpack(ContentManifest.Pack pack, File archive) throws Exception {
        if (archive.length() != pack.size || !digest(archive).equals(pack.sha256)) throw new IOException("下载包校验失败");
        File objects = new File(directory, "objects");
        File temporary = Files.createTempDirectory(objects.toPath(), ".install-").toFile();
        Set<String> seen = new HashSet<>(); long expanded = 0; int members = 0;
        try {
            Map<String, ContentManifest.FileRef> expected = new java.util.HashMap<>();
            for (ContentManifest.FileRef file : pack.files) expected.put(file.path, file);
            try (ZipInputStream zip = new ZipInputStream(new FileInputStream(archive))) {
                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    if (++members > 24000 || Thread.currentThread().isInterrupted()) throw new IOException("压缩包条目过多或安装已停止");
                    String name = entry.getName();
                    if (entry.isDirectory()) {
                        String path = name.endsWith("/") ? name.substring(0, name.length() - 1) : name;
                        if (path.startsWith("/") || path.contains("\\") || path.contains("%") || path.contains("..")) throw new IOException("压缩包目录无效");
                        zip.closeEntry(); continue;
                    }
                    ContentManifest.FileRef file = expected.get(name);
                    if (file == null || !seen.add(name) || !ContentManifest.validPath(name)) throw new IOException("压缩包包含未声明或重复文件");
                    File destination = new File(temporary, name);
                    if (!destination.getCanonicalPath().startsWith(temporary.getCanonicalPath() + File.separator)) throw new IOException("压缩包路径越界");
                    mkdir(destination.getParentFile()); long size = 0;
                    MessageDigest hash = MessageDigest.getInstance("SHA-256");
                    try (FileOutputStream output = new FileOutputStream(destination)) {
                        byte[] buffer = new byte[32768]; int count;
                        while ((count = zip.read(buffer)) != -1) {
                            if (Thread.currentThread().isInterrupted()) throw new IOException("安装已停止");
                            size += count; expanded += count;
                            if (size > file.size || expanded > ContentManifest.MAX_EXPANDED) throw new IOException("解压大小越界");
                            hash.update(buffer, 0, count); output.write(buffer, 0, count);
                        }
                        output.getFD().sync();
                    }
                    if (size != file.size || !ContentManifest.hex(hash.digest()).equals(file.sha256)) throw new IOException("资源文件校验失败");
                    zip.closeEntry();
                }
            }
            if (seen.size() != pack.files.size()) throw new IOException("压缩包缺少资源文件");
            writeAtomic(new File(temporary, ".ready"), pack.sha256.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            File destination = new File(objects, pack.sha256);
            if (destination.exists()) remove(destination);
            Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE);
        } finally { remove(temporary); }
    }

    public void installSnapshot(ContentManifest manifest) throws Exception {
        // APK assets are replaced by an app upgrade. Retain the exact verified
        // bytes used by an installed snapshot so its unchanged packages remain
        // available for offline rollback after a newer APK is installed.
        for (ContentManifest.Pack pack : manifest.packages.values()) cacheBuiltinPack(pack);
        verifySnapshot(manifest);
        File folder = new File(directory, "snapshots/" + manifest.id); mkdir(folder);
        writeAtomic(new File(folder, "channel.json"), manifest.channelBytes);
        writeAtomic(new File(folder, "ready"), new byte[]{1});
        snapshots.put(manifest.id, manifest);
    }

    private void cacheBuiltinPack(ContentManifest.Pack pack) throws Exception {
        if (!isBuiltinPack(pack) || hasStoredPack(pack)) return;
        File objects = new File(directory, "objects");
        File temporary = Files.createTempDirectory(objects.toPath(), ".builtin-").toFile();
        try {
            for (ContentManifest.FileRef file : pack.files) {
                File target = new File(temporary, file.path); mkdir(target.getParentFile());
                MessageDigest hash = MessageDigest.getInstance("SHA-256"); long size = 0;
                try (InputStream input = assets.open("www/" + file.path); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32768]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted()) throw new IOException("安装已停止");
                        size += count; if (size > file.size) throw new IOException("内置资源大小不符");
                        hash.update(buffer, 0, count); output.write(buffer, 0, count);
                    }
                    output.getFD().sync();
                }
                if (size != file.size || !ContentManifest.hex(hash.digest()).equals(file.sha256)) throw new IOException("内置资源校验失败");
            }
            writeAtomic(new File(temporary, ".ready"), pack.sha256.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            File target = new File(objects, pack.sha256);
            if (target.exists()) remove(target);
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
        } finally { remove(temporary); }
    }

    private void verifySnapshot(ContentManifest manifest) throws Exception {
        for (ContentManifest.Pack pack : manifest.packages.values()) {
            if (!hasPack(pack)) throw new IOException("更新缺少资源包");
            for (ContentManifest.FileRef file : pack.files) {
                try (InputStream input = openPackageFile(pack, file.path)) {
                    MessageDigest hash = MessageDigest.getInstance("SHA-256"); long size = 0; byte[] buffer = new byte[32768]; int count;
                    while ((count = input.read(buffer)) != -1) { size += count; if (size > file.size) throw new IOException("已缓存资源大小不符"); hash.update(buffer, 0, count); }
                    if (size != file.size || !ContentManifest.hex(hash.digest()).equals(file.sha256)) throw new IOException("已缓存资源校验失败");
                }
            }
        }
    }

    public void collect(Set<String> keep) {
        Set<String> packages = new HashSet<>();
        for (String id : keep) {
            ContentManifest manifest = snapshots.get(id);
            if (manifest != null) for (ContentManifest.Pack pack : manifest.packages.values()) packages.add(pack.sha256);
        }
        File[] versions = new File(directory, "snapshots").listFiles();
        if (versions != null) for (File version : versions) if (!keep.contains(version.getName())) { snapshots.remove(version.getName()); remove(version); }
        File[] objects = new File(directory, "objects").listFiles();
        if (objects != null) for (File object : objects) if (!packages.contains(object.getName())) remove(object);
    }

    public String entryPath(String id) { return id.equals(builtinId()) ? "/assets/www/standalone/index.html" : "/assets/updates/" + id + "/www/standalone/index.html"; }

    public InputStream openPath(String path) throws IOException {
        if (path.startsWith("www/")) return assets.open(path);
        String[] parts = path.split("/", 4);
        if (parts.length != 4 || !parts[0].equals("updates") || !parts[2].equals("www")) throw new IOException("资源路径无效");
        ContentManifest manifest = snapshots.get(parts[1]);
        if (manifest == null) throw new IOException("快照未通过验证");
        ContentManifest.FileRef file = manifest.files.get(parts[3]);
        if (file == null) throw new IOException("资源未声明");
        return openPackageFile(manifest.packages.get(file.packageId), file.path);
    }

    private InputStream openPackageFile(ContentManifest.Pack pack, String path) throws IOException {
        return isBuiltinPack(pack) ? assets.open("www/" + path) : new FileInputStream(new File(directory, "objects/" + pack.sha256 + "/" + path));
    }

    public static byte[] read(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[16384]; int count;
        while ((count = input.read(buffer)) != -1) { if (output.size() + count > limit) throw new IOException("内容超过大小限制"); output.write(buffer, 0, count); }
        return output.toByteArray();
    }

    public static String digest(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[32768]; int count; while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count); }
        return ContentManifest.hex(digest.digest());
    }

    public static void writeAtomic(File file, byte[] bytes) throws IOException {
        mkdir(file.getParentFile()); AtomicFile atomic = new AtomicFile(file); FileOutputStream output = null;
        try { output = atomic.startWrite(); output.write(bytes); atomic.finishWrite(output); }
        catch (IOException error) { if (output != null) atomic.failWrite(output); throw error; }
    }
    public static byte[] readAtomic(File file, int limit) throws IOException { try (InputStream input = new AtomicFile(file).openRead()) { return read(input, limit); } }
    public static void mkdir(File file) throws IOException { if (!file.isDirectory() && !file.mkdirs()) throw new IOException("无法创建私有资源目录"); }
    public static void remove(File file) { File[] children = file.listFiles(); if (children != null) for (File child : children) remove(child); file.delete(); }
}
