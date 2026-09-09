package io.github.jacklee992.wanba;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapRegionDecoder;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Decode only a trusted atlas region off the main thread; recycled rows share bounded thumbnails. */
final class NativeIconLoader implements AutoCloseable {
    interface Resources { InputStream open(String path) throws Exception; }
    private final Resources resources;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getAllocationByteCount(); }
    };
    private final Map<String, List<WeakReference<ImageView>>> pending = new HashMap<>();
    private String prefix = "www/";
    private boolean closed;
    NativeIconLoader(Resources resources) { this.resources = resources; }
    void setEntry(String entry) {
        if (entry != null && entry.startsWith("/assets/") && entry.endsWith("standalone/index.html")) {
            String next = entry.substring(8, entry.length() - "standalone/index.html".length());
            if (!next.equals(prefix)) { prefix = next; cache.evictAll(); }
        }
    }
    void load(ImageView target, JSONObject icon, int requestedPixels) {
        target.setImageDrawable(null); target.setTag(null);
        if (closed || icon == null) return;
        String path = icon.optString("path");
        if (!ContentManifest.validPath(path) || !(path.startsWith("assets/game-art/") || path.startsWith("assets/game-icons/"))) return;
        JSONArray area = icon.optJSONArray("sourceRect"), source = icon.optJSONArray("sourceSize");
        if (area == null || area.length() != 4 || source == null || source.length() != 2) return;
        int x = area.optInt(0, -1), y = area.optInt(1, -1), width = area.optInt(2), height = area.optInt(3);
        int fullWidth = source.optInt(0), fullHeight = source.optInt(1);
        if (x < 0 || y < 0 || width < 1 || height < 1 || fullWidth > 16384 || fullHeight > 16384
                || (long)x + width > fullWidth || (long)y + height > fullHeight) return;
        int pixels = Math.max(64, Math.min(256, requestedPixels));
        String resourcePath = prefix + path;
        String key = resourcePath + ":" + area + ":" + pixels;
        target.setTag(key);
        Bitmap cached = cache.get(key);
        if (cached != null) { target.setImageBitmap(cached); return; }
        List<WeakReference<ImageView>> waiting = pending.get(key);
        if (waiting != null) { waiting.add(new WeakReference<>(target)); return; }
        waiting = new ArrayList<>(); waiting.add(new WeakReference<>(target)); pending.put(key, waiting);
        worker.execute(() -> {
            Bitmap thumbnail = null;
            try (InputStream input = resources.open(resourcePath)) {
                BitmapRegionDecoder decoder = BitmapRegionDecoder.newInstance(input, false);
                try {
                    if (decoder.getWidth() != fullWidth || decoder.getHeight() != fullHeight) throw new IllegalArgumentException("Atlas dimensions changed");
                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    options.inSampleSize = 1;
                    while (Math.min(width, height) / (options.inSampleSize * 2) >= pixels) options.inSampleSize *= 2;
                    Bitmap region = decoder.decodeRegion(new Rect(x, y, x + width, y + height), options);
                    if (region != null) {
                        thumbnail = Bitmap.createScaledBitmap(region, pixels, pixels, true);
                        if (thumbnail != region) region.recycle();
                    }
                } finally { decoder.recycle(); }
            } catch (Exception ignored) { /* The native game title remains a usable entry if artwork is unavailable. */ }
            final Bitmap result = thumbnail;
            main.post(() -> {
                List<WeakReference<ImageView>> views = pending.remove(key);
                if (closed) { if (result != null) result.recycle(); return; }
                if (result != null) cache.put(key, result);
                if (views != null) for (WeakReference<ImageView> ref : views) {
                    ImageView view = ref.get();
                    if (view != null && key.equals(view.getTag())) view.setImageBitmap(result);
                }
            });
        });
    }
    @Override public void close() { closed = true; pending.clear(); worker.shutdownNow(); cache.evictAll(); }
}
