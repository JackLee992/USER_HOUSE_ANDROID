package io.github.jacklee992.wanba;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Pure policy shared by request interception, navigation and host-side tests. */
public final class LocalAssetPolicy {
    public static final String ORIGIN = "https://appassets.androidplatform.net";
    public static final String ENTRY = ORIGIN + "/assets/www/standalone/index.html";
    public static final String DOWNLOADS = "https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest";

    public static final int MIN_WEBVIEW_MAJOR = 124;

    private LocalAssetPolicy() {}

    public static boolean compatibleWebView(String version) {
        if (version == null) return false;
        try { return Integer.parseInt(version.split("\\.", 2)[0]) >= MIN_WEBVIEW_MAJOR; }
        catch (NumberFormatException error) { return false; }
    }

    public static String assetPath(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())
                    || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/www/") || path.indexOf('\\') >= 0
                    || path.indexOf('\0') >= 0 || path.indexOf('%') >= 0) return null;
            for (String part : path.split("/", -1)) if ("..".equals(part) || ".".equals(part)) return null;
            String relative = path.substring("/assets/www/".length());
            boolean allowed = relative.equals("style.css") || relative.startsWith("src/")
                    || relative.startsWith("standalone/") || relative.startsWith("assets/game-icons/")
                    || relative.startsWith("assets/space-cadet/") || relative.startsWith("assets/app-brand/")
                    || relative.startsWith("licenses/space-cadet/");
            return allowed && !relative.endsWith("/") ? "www/" + relative : null;
        } catch (URISyntaxException error) {
            return null;
        }
    }

    public static boolean isEntry(String url) {
        return "www/standalone/index.html".equals(assetPath(url));
    }

    public static String mimeType(String path) {
        String name = path.toLowerCase(Locale.ROOT);
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".wasm")) return "application/wasm";
        if (name.endsWith(".data") || name.endsWith(".dat")) return "application/octet-stream";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".wav")) return "audio/wav";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".ogg")) return "audio/ogg";
        if (name.endsWith(".woff2")) return "font/woff2";
        if (name.endsWith(".txt") || name.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }
}
