package io.github.jacklee992.wanba.appupdater;

import java.io.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded binary copy/add reconstruction. Memory is independent of APK size. */
final class UpdateFiles {
    static final byte[] MAGIC = new byte[]{'W','A','U','P','D','0','0','1'};
    static final int BUFFER = 32768, MAX_OPS = 65536;
    static final class Cancelled extends IOException { Cancelled() { super("Cancelled"); } }
    static void check(AtomicBoolean cancel) throws Cancelled { if (cancel.get() || Thread.currentThread().isInterrupted()) throw new Cancelled(); }
    static String hash(byte[] bytes) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    static String hash(File file, AtomicBoolean cancel) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256"); byte[] buffer = new byte[BUFFER];
        try (InputStream in = new FileInputStream(file)) { int n; while ((n = in.read(buffer)) != -1) { check(cancel); digest.update(buffer, 0, n); } }
        check(cancel); return hex(digest.digest());
    }
    static String hex(byte[] bytes) { StringBuilder b = new StringBuilder(); for (byte v : bytes) b.append(String.format(java.util.Locale.ROOT, "%02x", v & 255)); return b.toString(); }
    static byte[] read(File f, int limit) throws IOException { try (InputStream in = new FileInputStream(f)) { return read(in, limit); } }
    static byte[] read(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) != -1) { if (out.size() + n > limit) throw new IOException("File size limit"); out.write(buf, 0, n); }
        return out.toByteArray();
    }
    static void reconstruct(File base, File patch, File target, long expectedSize, AtomicBoolean cancel) throws Exception {
        UpdateProtocol.require(expectedSize > 0 && expectedSize <= UpdateProtocol.MAX_APK, "APK size limit");
        boolean complete = false;
        try (RandomAccessFile old = new RandomAccessFile(base, "r"); DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(patch))); FileOutputStream out = new FileOutputStream(target)) {
            byte[] magic = new byte[8]; in.readFully(magic);
            UpdateProtocol.require(Arrays.equals(MAGIC, magic) && in.readLong() == expectedSize, "Patch header rejected");
            byte[] buf = new byte[BUFFER]; long written = 0;
            for (int ops = 0; ; ops++) {
                check(cancel); UpdateProtocol.require(ops <= MAX_OPS, "Patch operation limit");
                int kind = in.readUnsignedByte();
                if (kind == 0) { UpdateProtocol.require(written == expectedSize && in.read() == -1, "Patch output length or trailing bytes"); break; }
                UpdateProtocol.require(kind == 1 || kind == 2, "Unknown patch operation");
                long offset = kind == 1 ? in.readLong() : 0;
                long remaining = in.readInt();
                UpdateProtocol.require(remaining > 0 && remaining <= expectedSize - written, "Patch output overflow");
                if (kind == 1) { UpdateProtocol.require(offset >= 0 && offset <= old.length() && remaining <= old.length() - offset, "Patch base range"); old.seek(offset); }
                written += remaining;
                while (remaining > 0) {
                    check(cancel); int n = (int)Math.min(buf.length, remaining);
                    if (kind == 1) old.readFully(buf, 0, n); else in.readFully(buf, 0, n);
                    out.write(buf, 0, n); remaining -= n;
                }
            }
            check(cancel); out.getFD().sync(); complete = true;
        } finally { if (!complete && target.exists() && !target.delete()) target.deleteOnExit(); }
    }
}
