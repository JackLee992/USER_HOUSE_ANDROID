package io.github.jacklee992.wanba.appupdater;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.net.URI;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/** Signed metadata for complete APK installation, never a class-loading protocol. */
final class UpdateProtocol {
    static final String REPOSITORY = "JackLee992/USER_HOUSE_ANDROID";
    static final String CHANNEL = "https://github.com/" + REPOSITORY + "/releases/latest/download/app-updates.json";
    static final int MAX_MANIFEST = 131072;
    static final long MAX_APK = 512L * 1024 * 1024;
    static final long MAX_PATCH = 256L * 1024 * 1024;
    final long sequence;
    final String payloadHash;
    final Entry entry;

    static final class Asset {
        final String url, hash;
        final long size;
        Asset(JSONObject j, long max) throws Exception {
            url = j.getString("url"); require(validAssetUrl(url), "Invalid release asset URL");
            hash = hash(j.getString("sha256")); size = integer(j, "size", 1, max);
        }
    }
    static final class Delta {
        final String baseHash;
        final long baseVersion;
        final Asset asset;
        Delta(JSONObject j) throws Exception {
            require("copy-add-v1".equals(j.getString("format")), "Unsupported patch format");
            baseHash = hash(j.getString("baseSha256")); baseVersion = integer(j, "baseVersionCode", 1, Integer.MAX_VALUE);
            asset = new Asset(j, MAX_PATCH);
        }
    }
    static final class Entry {
        final String packageName, versionName, signer;
        final long versionCode, minSdk;
        final Asset full;
        final List<Delta> deltas = new ArrayList<>();
        Entry(JSONObject j) throws Exception {
            packageName = j.getString("packageName");
            require(packageName.equals("io.github.jacklee992.wanba") || packageName.equals("io.github.jacklee992.wanba.compat"), "Unknown application");
            versionCode = integer(j, "versionCode", 1, Integer.MAX_VALUE);
            versionName = j.getString("versionName"); require(versionName.matches("[A-Za-z0-9._-]{1,64}"), "Invalid version name");
            minSdk = integer(j, "minSdk", 26, 1000); signer = hash(j.getString("signerSha256"));
            full = new Asset(j.getJSONObject("full"), MAX_APK);
            JSONArray list = j.optJSONArray("deltas");
            require(list == null || list.length() <= 3, "Too many patches");
            if (list != null) for (int n = 0; n < list.length(); n++) {
                Delta d = new Delta(list.getJSONObject(n));
                require(d.baseVersion < versionCode && d.asset.size < full.size, "Invalid patch base or size");
                for (Delta prior : deltas) require(!prior.baseHash.equals(d.baseHash), "Duplicate patch base");
                deltas.add(d);
            }
        }
    }

    UpdateProtocol(byte[] envelope, byte[] trust, String packageName, long nowSeconds) throws Exception {
        require(envelope.length > 0 && envelope.length <= MAX_MANIFEST, "Manifest size limit");
        JSONObject outer = new JSONObject(new String(envelope, java.nio.charset.StandardCharsets.UTF_8));
        require(integer(outer, "schema", 1, 1) == 1, "Envelope schema");
        byte[] payload = Base64.getDecoder().decode(outer.getString("payload"));
        byte[] signature = Base64.getDecoder().decode(outer.getString("signature"));
        require(payload.length <= 65536 && signature.length >= 64 && signature.length <= 80, "Signature bounds");
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(trust)));
        verifier.update(payload); require(verifier.verify(signature), "Manifest signature rejected");
        JSONObject p = new JSONObject(new String(payload, java.nio.charset.StandardCharsets.UTF_8));
        require(integer(p, "schema", 1, 1) == 1 && "wanba-apk-update".equals(p.getString("kind")), "Wrong signed document domain");
        require(REPOSITORY.equals(p.getString("repository")), "Wrong repository");
        long issued = integer(p, "issuedAt", 1, Long.MAX_VALUE);
        long expires = integer(p, "expiresAt", issued, Long.MAX_VALUE);
        require(expires - issued <= 31L * 86400 && nowSeconds >= issued - 86400 && nowSeconds <= expires, "Manifest expired or device clock incorrect");
        sequence = integer(p, "sequence", 1, Integer.MAX_VALUE);
        payloadHash = UpdateFiles.hash(payload);
        JSONArray entries = p.getJSONArray("apps"); require(entries.length() >= 1 && entries.length() <= 2, "Application count");
        Entry found = null; List<String> packages = new ArrayList<>();
        for (int n = 0; n < entries.length(); n++) {
            Entry next = new Entry(entries.getJSONObject(n));
            require(!packages.contains(next.packageName), "Duplicate application"); packages.add(next.packageName);
            if (packageName.equals(next.packageName)) found = next;
        }
        require(found != null, "No update for this application flavor"); entry = found;
    }

    static long integer(JSONObject j, String key, long min, long max) throws Exception {
        Object value = j.get(key);
        require(value instanceof Integer || value instanceof Long, "Integer required: " + key);
        long n = ((Number) value).longValue(); require(n >= min && n <= max, "Out of range: " + key); return n;
    }
    static String hash(String s) throws IOException { require(s.matches("[0-9a-f]{64}"), "Invalid SHA-256"); return s; }
    static void checkSequence(UpdateProtocol candidate, long seen, String seenHash) throws IOException {
        require(candidate.sequence >= seen && (candidate.sequence != seen || candidate.payloadHash.equals(seenHash)), "Release replay/equivocation rejected");
    }
    static boolean validAssetUrl(String s) {
        try {
            URI u = new URI(s); if (!https(u) || !"github.com".equals(u.getHost()) || u.getRawQuery() != null) return false;
            return u.getRawPath().matches("/" + REPOSITORY + "/releases/download/[A-Za-z0-9][A-Za-z0-9._-]{0,79}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}");
        } catch (Exception e) { return false; }
    }
    static boolean validRedirect(String s) {
        try {
            URI u = new URI(s); if (!https(u) || s.length() > 16384) return false;
            if ("github.com".equals(u.getHost())) return s.equals(CHANNEL) || validAssetUrl(s);
            return ("release-assets.githubusercontent.com".equals(u.getHost()) || "objects.githubusercontent.com".equals(u.getHost()))
                    && u.getRawPath() != null && u.getRawPath().startsWith("/");
        } catch (Exception e) { return false; }
    }
    private static boolean https(URI u) { return "https".equals(u.getScheme()) && (u.getPort() == -1 || u.getPort() == 443) && u.getRawUserInfo() == null && u.getRawFragment() == null; }
    static void require(boolean ok, String message) throws IOException { if (!ok) throw new IOException(message); }
}
