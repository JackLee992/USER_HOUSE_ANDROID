package io.github.jacklee992.wanba.appupdater;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

final class UpdateHttp {
    interface Progress { void bytes(long done, long total); }
    private volatile HttpURLConnection active;
    void disconnect() { HttpURLConnection connection = active; if (connection != null) connection.disconnect(); }
    void download(String start, File target, long size, long limit, AtomicBoolean cancel, Progress progress) throws Exception {
        UpdateProtocol.require(start.equals(UpdateProtocol.CHANNEL) || UpdateProtocol.validAssetUrl(start), "Download source rejected");
        String url = start; boolean complete = false;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                UpdateFiles.check(cancel); UpdateProtocol.require(UpdateProtocol.validRedirect(url), "Redirect source rejected");
                HttpURLConnection connection = (HttpURLConnection)new URL(url).openConnection(); active = connection;
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
                connection.setRequestProperty("Accept-Encoding", "identity"); connection.setRequestProperty("User-Agent", "Wanba-ApkUpdater/1");
                UpdateFiles.check(cancel);
                try {
                    int status = connection.getResponseCode();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String next = connection.getHeaderField("Location"); UpdateProtocol.require(next != null && redirects < 5, "Redirect limit");
                        url = new URI(url).resolve(next).toString(); continue;
                    }
                    UpdateProtocol.require(status == 200, "Download HTTP " + status);
                    long length = connection.getContentLengthLong();
                    UpdateProtocol.require(length <= limit && (size < 0 || length < 0 || length == size), "Download length rejected");
                    String encoding = connection.getContentEncoding(); UpdateProtocol.require(encoding == null || "identity".equalsIgnoreCase(encoding), "Encoded download rejected");
                    long total = 0; byte[] buf = new byte[UpdateFiles.BUFFER];
                    try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                        int n; while ((n = in.read(buf)) != -1) {
                            total += n; progress.bytes(total, size); // Include the last successful read even if it triggers cancellation/size rejection.
                            UpdateFiles.check(cancel); UpdateProtocol.require(total <= limit && (size < 0 || total <= size), "Download exceeds signed size"); out.write(buf, 0, n);
                        }
                        UpdateProtocol.require(size < 0 || size == total, "Incomplete download"); UpdateFiles.check(cancel); out.getFD().sync();
                    }
                    complete = true; return;
                } finally { connection.disconnect(); active = null; }
            }
            throw new IOException("Redirect limit");
        } finally { active = null; if (!complete) target.delete(); }
    }
}
