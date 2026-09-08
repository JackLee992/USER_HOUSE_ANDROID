package io.github.jacklee992.wanba;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Exact-byte signed content protocol. It never trusts executable locations supplied by a page. */
public final class ContentManifest {
    public static final String REPOSITORY = "JackLee992/USER_HOUSE_GAME_PACKS";
    public static final int HOST_API = 1;
    public static final long MAX_EXPANDED = 512L * 1024 * 1024;
    public final String id, snapshotVersion, releaseTag, entry;
    public final long sequence;
    public final byte[] channelBytes;
    public final JSONObject payload;
    public final Map<String, Pack> packages;
    public final Map<String, FileRef> files;
    private static final String VERSION = "(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?";
    private static final Set<String> LOCALES = new HashSet<>(Arrays.asList("zh-CN", "zh-TW", "en", "ja", "ko"));

    public static final class Pack {
        public final String id, kind, version, url, sha256;
        public final long size;
        public final List<FileRef> files = new ArrayList<>();
        Pack(JSONObject value, long sequence) throws Exception {
            id = text(value, "id", 100); kind = text(value, "kind", 10); version = text(value, "version", 80);
            require(id.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,99}") && version.matches(VERSION), "无效的资源包版本或标识");
            require(Arrays.asList("core", "game", "art", "i18n").contains(kind), "未知资源包类型");
            require(kind.equals("core") ? id.equals("core") : id.startsWith(kind + "."), "资源包类型与标识不符");
            sha256 = hash(value, "sha256"); size = number(value, "size", 1, 128L * 1024 * 1024);
            url = text(value, "url", 1024); require(validArchiveUrl(url, sequence), "资源包来源不在固定发布仓库");
        }
    }

    public static final class FileRef {
        public final String path, sha256, packageId;
        public final long size;
        FileRef(JSONObject value, Pack pack) throws Exception {
            path = text(value, "path", 240); sha256 = hash(value, "sha256"); size = number(value, "size", 0, 64L * 1024 * 1024);
            packageId = pack.id;
            require(validPath(path), "资源路径无效");
            String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT);
            if (pack.kind.equals("art")) require(Arrays.asList("png", "jpg", "jpeg", "webp", "avif", "woff", "woff2", "ttf", "otf", "json", "txt", "md").contains(extension), "美术包包含非美术文件");
            if (pack.kind.equals("i18n")) require(extension.equals("json") || extension.equals("txt"), "语言包只能包含文本数据");
        }
    }

    public static ContentManifest parse(byte[] envelope, byte[] key, int appVersionCode) throws Exception {
        require(envelope.length > 0 && envelope.length <= 4 * 1024 * 1024, "更新清单过大");
        JSONObject channel = new JSONObject(utf8(envelope));
        require(number(channel, "schema", 1, 1) == 1, "未知更新协议");
        byte[] bytes = Base64.getDecoder().decode(text(channel, "payload", 3 * 1024 * 1024));
        require(bytes.length > 0 && bytes.length <= 2 * 1024 * 1024, "更新清单过大");
        byte[] signature = Base64.getDecoder().decode(text(channel, "signature", 256));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(key)));
        verifier.update(bytes);
        require(verifier.verify(signature), "更新签名验证失败");
        return new ContentManifest(envelope, bytes, appVersionCode);
    }

    private ContentManifest(byte[] envelope, byte[] bytes, int appVersionCode) throws Exception {
        channelBytes = envelope.clone(); id = sha256(bytes); payload = new JSONObject(utf8(bytes));
        number(payload, "schema", 1, 1);
        sequence = number(payload, "sequence", 1, Integer.MAX_VALUE);
        releaseTag = text(payload, "releaseTag", 40); require(releaseTag.equals("content-" + sequence), "发布序号与标签不符");
        snapshotVersion = text(payload, "snapshotVersion", 80); require(snapshotVersion.matches(VERSION), "快照版本无效");
        long min = number(payload, "minHostApi", 1, 1000), max = number(payload, "maxHostApi", min, 1000);
        require(min <= HOST_API && max >= HOST_API, "请先升级玩吧 App：内容接口不兼容");
        require(number(payload, "minAppVersionCode", 3, Integer.MAX_VALUE) <= appVersionCode, "请先升级玩吧 App");
        number(payload, "runtimeApi", 1, 1);
        require(text(payload, "sourceCommit", 40).matches("[0-9a-f]{40}"), "源码版本无效");
        entry = text(payload, "entry", 100); require(entry.equals("standalone/index.html"), "入口无效");
        Map<String, Pack> packs = new LinkedHashMap<>(); Map<String, FileRef> paths = new LinkedHashMap<>();
        JSONArray list = payload.getJSONArray("packages"); require(list.length() > 0 && list.length() <= 256, "资源包数量无效");
        long expanded = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject value = list.getJSONObject(i); Pack pack = new Pack(value, sequence);
            require(packs.put(pack.id, pack) == null, "重复资源包");
            JSONArray entries = value.getJSONArray("files"); require(entries.length() > 0, "空资源包");
            for (int j = 0; j < entries.length(); j++) {
                FileRef file = new FileRef(entries.getJSONObject(j), pack);
                require(paths.put(file.path, file) == null, "多个资源包重复拥有文件");
                pack.files.add(file); expanded += file.size;
                require(paths.size() <= 12000 && expanded <= MAX_EXPANDED, "更新展开大小过大");
            }
        }
        require(packs.containsKey("core") && packs.get("core").kind.equals("core") && paths.containsKey(entry), "缺少共享运行时或入口");
        JSONObject games = payload.getJSONObject("games"); require(games.length() > 0 && games.length() <= 256, "游戏目录无效");
        for (String game : keys(games)) {
            require(game.matches("[a-z][a-z0-9_-]{0,47}"), "游戏标识无效");
            JSONObject descriptor = games.getJSONObject(game);
            Pack code = packs.get(text(descriptor, "code", 100));
            require(code != null && code.kind.equals("game") && code.version.equals(text(descriptor, "version", 80)), "游戏版本与代码包不符");
            number(descriptor, "saveSchema", 0, 100000);
            JSONArray art = descriptor.getJSONArray("art");
            for (int i = 0; i < art.length(); i++) { Pack p = packs.get(art.getString(i)); require(p != null && p.kind.equals("art"), "缺少美术依赖"); }
        }
        JSONObject locales = payload.getJSONObject("locales"); require(keys(locales).equals(LOCALES), "必须提供简繁英日韩五种语言包");
        for (String locale : LOCALES) { Pack p = packs.get(locales.getString(locale)); require(p != null && p.kind.equals("i18n"), "语言包依赖无效"); }
        packages = Collections.unmodifiableMap(packs); files = Collections.unmodifiableMap(paths);
    }

    public void requireSaveCompatibility(ContentManifest previous) throws Exception {
        if (previous == null) return;
        JSONObject before = previous.payload.getJSONObject("games"), after = payload.getJSONObject("games");
        for (String id : keys(before)) {
            require(after.has(id), "此次更新缺少已安装游戏");
            require(before.getJSONObject(id).getInt("saveSchema") == after.getJSONObject(id).getInt("saveSchema"), "此次更新改变存档格式，暂不能安全切换");
        }
    }

    public JSONObject summary() throws Exception {
        JSONObject result = new JSONObject(payload.toString()); result.put("snapshotId", id);
        JSONArray entries = result.getJSONArray("packages");
        for (int i = 0; i < entries.length(); i++) entries.getJSONObject(i).remove("files");
        return result;
    }

    public static boolean validArchiveUrl(String url, long sequence) {
        try {
            URI uri = new URI(url); String prefix = "/" + REPOSITORY + "/releases/download/content-";
            if (!"https".equals(uri.getScheme()) || !"github.com".equals(uri.getHost()) || uri.getPort() != -1
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !uri.getRawPath().startsWith(prefix)) return false;
            String[] rest = uri.getRawPath().substring(prefix.length()).split("/", -1);
            if (rest.length != 2 || !rest[0].matches("[1-9][0-9]{0,9}") || !rest[1].matches("[A-Za-z0-9][A-Za-z0-9._-]{0,150}\\.zip")) return false;
            return Long.parseLong(rest[0]) <= sequence;
        } catch (Exception error) { return false; }
    }

    public static boolean validPath(String path) {
        if (path == null || path.length() > 240 || path.startsWith("/") || path.indexOf('\\') >= 0 || path.indexOf('%') >= 0 || path.matches(".*[\\x00-\\x1f\\x7f].*")) return false;
        for (String part : path.split("/", -1)) if (part.isEmpty() || part.startsWith(".")) return false;
        boolean root = path.equals("style.css") || path.startsWith("src/") || path.startsWith("standalone/") || path.startsWith("assets/game-icons/")
                || path.startsWith("assets/game-art/") || path.startsWith("assets/space-cadet/") || path.startsWith("assets/app-brand/")
                || path.startsWith("licenses/") || path.startsWith("locales/") || path.startsWith("content/");
        return root && !path.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(so|dex|apk|exe|dll|dylib|jar|class)$");
    }

    public static String sha256(byte[] bytes) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    public static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return out.toString(); }
    private static String utf8(byte[] bytes) throws Exception { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString(); }
    private static String text(JSONObject value, String key, int limit) throws Exception { Object raw = value.get(key); require(raw instanceof String && ((String) raw).length() > 0 && ((String) raw).length() <= limit, "字段无效: " + key); return (String) raw; }
    private static String hash(JSONObject value, String key) throws Exception { String hash = text(value, key, 64); require(hash.matches("[0-9a-f]{64}"), "摘要无效"); return hash; }
    private static long number(JSONObject value, String key, long min, long max) throws Exception { Object n = value.get(key); require(n instanceof Number && ((Number) n).doubleValue() == ((Number) n).longValue(), "数值无效: " + key); long result = ((Number) n).longValue(); require(result >= min && result <= max, "数值越界: " + key); return result; }
    private static Set<String> keys(JSONObject value) { Set<String> keys = new HashSet<>(); java.util.Iterator<String> iterator = value.keys(); while (iterator.hasNext()) keys.add(iterator.next()); return keys; }
    private static void require(boolean valid, String message) { if (!valid) throw new IllegalArgumentException(message); }
}
