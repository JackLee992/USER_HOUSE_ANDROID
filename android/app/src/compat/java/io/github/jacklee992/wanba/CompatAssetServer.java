package io.github.jacklee992.wanba;

import android.content.res.AssetManager;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** A read-only packaged asset origin. It never binds to LAN interfaces or serves app storage. */
final class CompatAssetServer implements AutoCloseable {
    static final int PORT = 38657;
    static final String HOST = "127.0.0.1:" + PORT;
    static final String ORIGIN = "http://" + HOST;
    static final String ENTRY = ORIGIN + "/assets/www/standalone/index.html";
    interface ResourceOpener { InputStream open(String path) throws IOException; }
    private final ResourceOpener resources;
    private final ServerSocket listener;
    private final ThreadPoolExecutor clients = new ThreadPoolExecutor(2, 4, 10, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(24), task -> { Thread t = new Thread(task, "wanba-assets"); t.setDaemon(true); return t; });
    private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
    private volatile boolean closed;

    CompatAssetServer(AssetManager assets) throws IOException {
        this(assets::open);
    }

    CompatAssetServer(ResourceOpener resources) throws IOException {
        this.resources = resources;
        listener = new ServerSocket();
        try {
            listener.setReuseAddress(true);
            listener.bind(new java.net.InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT), 16);
        } catch (IOException error) { listener.close(); clients.shutdownNow(); throw error; }
        Thread accept = new Thread(() -> {
            while (!closed) {
                try {
                    Socket socket = listener.accept();
                    sockets.add(socket);
                    if (closed) { release(socket); continue; }
                    try { clients.execute(() -> serve(socket)); }
                    catch (java.util.concurrent.RejectedExecutionException full) { release(socket); }
                } catch (IOException error) { if (!closed) close(); }
            }
        }, "wanba-asset-listener");
        accept.setDaemon(true);
        accept.start();
    }

    static String assetPath(String url) {
        if (url == null || !url.startsWith(ORIGIN + "/")) return null;
        return LocalAssetPolicy.assetPath(LocalAssetPolicy.ORIGIN + url.substring(ORIGIN.length()));
    }

    static boolean isEntry(String url) {
        return url != null && url.startsWith(ORIGIN + "/") && LocalAssetPolicy.isEntry(LocalAssetPolicy.ORIGIN + url.substring(ORIGIN.length()));
    }

    private void serve(Socket socket) {
        try (socket; InputStream input = new BufferedInputStream(socket.getInputStream());
             OutputStream output = new BufferedOutputStream(socket.getOutputStream())) {
            socket.setSoTimeout(5000);
            ByteArrayOutputStream raw = new ByteArrayOutputStream();
            int state = 0;
            while (state != 4) {
                int b = input.read();
                if (b == -1 || raw.size() >= 16384) return;
                raw.write(b);
                state = b == (state == 0 || state == 2 ? '\r' : '\n') ? state + 1 : (b == '\r' ? 1 : 0);
            }
            String[] lines = new String(raw.toByteArray(), StandardCharsets.ISO_8859_1).split("\r\n");
            String[] request = lines[0].split(" ");
            if (request.length != 3 || !(request[0].equals("GET") || request[0].equals("HEAD"))) { error(output, 405); return; }
            String host = null;
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0 && lines[i].substring(0, colon).equalsIgnoreCase("host")) {
                    if (host != null) { error(output, 403); return; }
                    host = lines[i].substring(colon + 1).trim();
                }
            }
            if (!HOST.equals(host) || !request[1].startsWith("/") || request[1].startsWith("//")) { error(output, 403); return; }
            String path = assetPath(ORIGIN + request[1]);
            if (path == null) { error(output, 403); return; }
            InputStream asset;
            try { asset = resources.open(path); }
            catch (IOException missing) { error(output, 404); return; }
            try (asset) {
                String mime = LocalAssetPolicy.mimeType(path);
                String headers = "HTTP/1.1 200 OK\r\nContent-Type: " + mime
                        + (mime.startsWith("text/") || mime.equals("application/json") ? "; charset=UTF-8" : "")
                        + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n";
                if (mime.equals("text/html")) headers += "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'\r\n";
                output.write((headers + "\r\n").getBytes(StandardCharsets.ISO_8859_1));
                if (!request[0].equals("HEAD")) {
                    byte[] buffer = new byte[32768];
                    int read;
                    while ((read = asset.read(buffer)) != -1) output.write(buffer, 0, read);
                }
                output.flush();
            }
        } catch (IOException ignored) { /* Cancelled loads close their sockets normally. */ }
        finally { release(socket); }
    }

    private static void error(OutputStream output, int status) throws IOException {
        output.write(("HTTP/1.1 " + status + " Blocked\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        output.flush();
    }

    private void release(Socket socket) {
        sockets.remove(socket);
        try { socket.close(); } catch (IOException ignored) { }
    }

    @Override public void close() {
        closed = true;
        try { listener.close(); } catch (IOException ignored) { }
        for (Socket socket : sockets) release(socket);
        clients.shutdownNow();
    }
}
