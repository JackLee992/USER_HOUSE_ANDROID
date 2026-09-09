package io.github.jacklee992.wanba.appupdater;

/** Counts actual bytes returned by reads, including a failed patch attempt; excludes HTTP/TLS overhead. */
final class DownloadAccounting {
    long patchBytes, fullBytes;
    boolean patchAttempted;
    void received(boolean patch, long bytes) {
        if (patch) { patchAttempted = true; patchBytes = bytes; } else fullBytes = bytes;
    }
    String summary(boolean patchSucceeded, long apkBytes) {
        String result;
        if (patchSucceeded) result = "增量下载成功：" + patchBytes + " 字节";
        else if (patchAttempted) result = "完整包下载成功：" + fullBytes + " 字节；补丁尝试 " + patchBytes
                + " 字节，累计 " + (patchBytes + fullBytes) + " 字节";
        else result = "完整包下载成功：" + fullBytes + " 字节";
        return result + "（完整 APK " + apkBytes + " 字节；仅计下载响应体）。";
    }
}
