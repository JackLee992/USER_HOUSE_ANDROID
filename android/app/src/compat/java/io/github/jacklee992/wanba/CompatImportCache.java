package io.github.jacklee992.wanba;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

/** Gecko FilePrompt needs a readable file path; SAF documents are copied into private app cache. */
final class CompatImportCache implements AutoCloseable {
    private static final long TOTAL_LIMIT = 64L * 1024 * 1024;
    private final File directory;
    private long total;
    private int count;

    CompatImportCache(File cacheDirectory) throws IOException {
        directory = Files.createTempDirectory(cacheDirectory.toPath(), "wanba-gecko-import-").toFile();
    }

    File copy(InputStream input, String filename, long limit) throws IOException {
        String name = filename.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
        if (name.isEmpty() || name.equals(".") || name.equals("..") || name.length() > 160)
            throw new IllegalArgumentException("文件名过长或无效，请重命名后再选择");
        File item = new File(directory, Integer.toString(count++));
        if (!item.mkdir()) throw new IOException("Cannot create private import directory");
        File target = new File(item, name);
        long size = 0;
        try (FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[16384];
            int bytes;
            while ((bytes = input.read(buffer)) != -1) {
                size += bytes; total += bytes;
                if (size > limit || total > TOTAL_LIMIT) throw new IllegalArgumentException("文件过大：JSON 最大 8MB，其他文件最大 32MB，总大小最大 64MB");
                output.write(buffer, 0, bytes);
            }
        }
        return target;
    }

    @Override public void close() { remove(directory); }

    private static void remove(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        file.delete();
    }
}
