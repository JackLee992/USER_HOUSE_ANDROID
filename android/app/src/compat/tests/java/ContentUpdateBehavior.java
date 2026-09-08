package io.github.jacklee992.wanba;

import android.content.Context;
import android.os.Handler;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Executed on a JVM with real JCA, ZIP, org.json, files and the production updater. */
public final class ContentUpdateBehavior {
    interface Checked { void run() throws Exception; }
    static int assertions;
    static KeyPair key;
    static File root;
    static final Map<String,byte[]> responses=new java.util.concurrent.ConcurrentHashMap<>();
    static final List<String> requested=Collections.synchronizedList(new ArrayList<>());
    static final String CHANNEL="https://github.com/"+ContentManifest.REPOSITORY+"/releases/latest/download/channel.json";
    static final String[] LOCALES = {"zh-CN","zh-TW","en","ja","ko"};
    static final String[] STORAGE = {"settings","scores","progress","records","sudokuState"};
    static final class Fixture {
        JSONObject payload;
        final Map<String,byte[]> archives = new LinkedHashMap<>();
        final Map<String,byte[]> files = new LinkedHashMap<>();
        byte[] channel() throws Exception { return sign(payload); }
        ContentManifest manifest() throws Exception { return ContentManifest.parse(channel(),key.getPublic().getEncoded(),3); }
    }
    static final class Events implements ContentUpdateManager.Listener {
        final LinkedBlockingQueue<String> loads = new LinkedBlockingQueue<>();
        final LinkedBlockingQueue<JSONObject> events = new LinkedBlockingQueue<>();
        public void onLoad(String path) { loads.add(path); }
        public void onEvent(String value) { events.add(new JSONObject(value)); }
        String loaded() throws Exception { String value=loads.poll(5,TimeUnit.SECONDS); check(value!=null,"expected an entry load"); return value; }
        JSONObject event(String state) throws Exception {
            long end=System.currentTimeMillis()+5000;
            while(System.currentTimeMillis()<end) {
                JSONObject value=events.poll(100,TimeUnit.MILLISECONDS);
                if(value!=null && state.equals(value.optString("state"))) return value;
            }
            throw new AssertionError("event not received: "+state+" "+events);
        }
    }
    public static void main(String[] args) throws Exception {
        root=new File(args[0],"fixtures"); root.mkdirs();
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC"); generator.initialize(new ECGenParameterSpec("secp256r1")); key=generator.generateKeyPair();
        // Replace only the transport in this host test, preserving production connect(),
        // URL allowlists, redirect checks, response codes and complete streaming/install flow.
        URL.setURLStreamHandlerFactory(protocol -> !protocol.equals("https") ? null : new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) {
                return new HttpURLConnection(url) {
                    @Override public int getResponseCode() { requested.add(url.toString()); return responses.containsKey(url.toString()) ? 200 : 404; }
                    @Override public InputStream getInputStream() throws IOException { byte[] bytes=responses.get(url.toString()); if(bytes==null) throw new FileNotFoundException(url.toString()); return new ByteArrayInputStream(bytes); }
                    @Override public long getContentLengthLong() { byte[] bytes=responses.get(url.toString()); return bytes==null ? -1 : bytes.length; }
                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                    @Override public void connect() {}
                };
            }
        });
        signatureAndSchema(); packageBehavior(); recoveryBehavior(); activationAndWatchdog(); downloadAndReplay(); redirectAndRoutes();
        System.out.println("PASS "+assertions+" real Java assertions");
    }
    static Fixture fixture(int sequence,String gameText) throws Exception {
        Fixture f=new Fixture(); JSONArray packs=new JSONArray();
        addPack(f,packs,"core","core",Collections.singletonMap("standalone/index.html","<script type=module src='../src/games/match3.js'></script>".getBytes(StandardCharsets.UTF_8)));
        addPack(f,packs,"game.match3","game",Collections.singletonMap("src/games/match3.js",gameText.getBytes(StandardCharsets.UTF_8)));
        addPack(f,packs,"art.match3","art",Collections.singletonMap("assets/game-art/match3/tile.png",new byte[]{1,2,3,4}));
        JSONObject locales=new JSONObject();
        for(String locale:LOCALES) { String id="i18n."+locale; addPack(f,packs,id,"i18n",Collections.singletonMap("locales/"+locale+".json",("{\"locale\":\""+locale+"\"}").getBytes(StandardCharsets.UTF_8))); locales.put(locale,id); }
        f.payload=new JSONObject().put("schema",1).put("sequence",sequence).put("snapshotVersion","1.0."+(sequence-1)).put("releaseTag","content-"+sequence)
            .put("minHostApi",1).put("maxHostApi",1).put("minAppVersionCode",3).put("runtimeApi",1).put("sourceCommit","0".repeat(40)).put("entry","standalone/index.html")
            .put("packages",packs).put("games",new JSONObject().put("match3",new JSONObject().put("version","1.0.0").put("code","game.match3").put("art",new JSONArray().put("art.match3")).put("saveSchema",3))).put("locales",locales);
        return f;
    }
    static void addPack(Fixture f,JSONArray packs,String id,String kind,Map<String,byte[]> entries) throws Exception {
        byte[] archive=zip(entries); f.archives.put(id,archive); f.files.putAll(entries); JSONArray files=new JSONArray();
        for(Map.Entry<String,byte[]> entry:entries.entrySet()) files.put(new JSONObject().put("path",entry.getKey()).put("sha256",ContentManifest.sha256(entry.getValue())).put("size",entry.getValue().length));
        packs.put(new JSONObject().put("id",id).put("kind",kind).put("version","1.0.0").put("url","https://github.com/"+ContentManifest.REPOSITORY+"/releases/download/content-1/"+id+".zip")
            .put("sha256",ContentManifest.sha256(archive)).put("size",archive.length).put("files",files));
    }
    static byte[] zip(Map<String,byte[]> entries) throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(ZipOutputStream output=new ZipOutputStream(bytes)) { for(Map.Entry<String,byte[]> entry:entries.entrySet()) { ZipEntry item=new ZipEntry(entry.getKey()); item.setTime(0); output.putNextEntry(item); output.write(entry.getValue()); output.closeEntry(); } }
        return bytes.toByteArray();
    }
    static byte[] sign(JSONObject value) throws Exception {
        byte[] bytes=value.toString().getBytes(StandardCharsets.UTF_8); Signature signature=Signature.getInstance("SHA256withECDSA"); signature.initSign(key.getPrivate()); signature.update(bytes);
        return new JSONObject().put("schema",1).put("payload",Base64.getEncoder().encodeToString(bytes)).put("signature",Base64.getEncoder().encodeToString(signature.sign())).toString().getBytes(StandardCharsets.UTF_8);
    }
    static void signatureAndSchema() throws Exception {
        Fixture f=fixture(1,"export const score=1;"); ContentManifest valid=f.manifest();
        check(valid.packages.size()==8 && valid.files.size()==8,"all independently declared packages");
        check(valid.id.equals(ContentManifest.sha256(f.payload.toString().getBytes(StandardCharsets.UTF_8))),"snapshot ID binds exact signed bytes");
        check(!valid.summary().getJSONArray("packages").getJSONObject(0).has("files"),"UI summary omits file inventory");
        JSONObject envelope=new JSONObject(new String(f.channel(),StandardCharsets.UTF_8));
        envelope.put("payload",Base64.getEncoder().encodeToString(f.payload.put("snapshotVersion","9.0.0").toString().getBytes(StandardCharsets.UTF_8)));
        rejects(()->ContentManifest.parse(envelope.toString().getBytes(StandardCharsets.UTF_8),key.getPublic().getEncoded(),3),"tampered signed payload");
        rejects(()->ContentManifest.parse(f.channel(),key.getPublic().getEncoded(),2),"old APK version");
        mutateReject("host API",p->p.put("minHostApi",2).put("maxHostApi",2));
        mutateReject("unknown runtime API",p->p.put("runtimeApi",2));
        mutateReject("sequence mismatch",p->p.put("releaseTag","content-9"));
        mutateReject("fractional sequence",p->p.put("sequence",1.5));
        mutateReject("outside repository",p->p.getJSONArray("packages").getJSONObject(0).put("url","https://github.com/other/repo/releases/download/content-1/core.zip"));
        mutateReject("future package release",p->p.getJSONArray("packages").getJSONObject(0).put("url","https://github.com/"+ContentManifest.REPOSITORY+"/releases/download/content-2/core.zip"));
        mutateReject("ZIP bomb declared size",p->p.getJSONArray("packages").getJSONObject(0).getJSONArray("files").getJSONObject(0).put("size",64L*1024*1024+1));
        mutateReject("duplicate path owner",p->p.getJSONArray("packages").getJSONObject(1).getJSONArray("files").getJSONObject(0).put("path","standalone/index.html"));
        mutateReject("game package version mismatch",p->p.getJSONObject("games").getJSONObject("match3").put("version","2.0.0"));
        mutateReject("missing locale",p->p.getJSONObject("locales").remove("ko"));
        mutateReject("executable art",p->p.getJSONArray("packages").getJSONObject(2).getJSONArray("files").getJSONObject(0).put("path","assets/game-art/match3/evil.js"));
        mutateReject("empty code package",p->p.getJSONArray("packages").getJSONObject(1).put("files",new JSONArray()));
        Fixture incompatible=fixture(2,"export const score=2;"); incompatible.payload.getJSONObject("games").getJSONObject("match3").put("saveSchema",4);
        rejects(()->incompatible.manifest().requireSaveCompatibility(valid),"save schema compatibility");
    }
    interface Mutation { void apply(JSONObject value) throws Exception; }
    static void mutateReject(String label,Mutation mutation) throws Exception { Fixture f=fixture(1,"game"); mutation.apply(f.payload); rejects(f::manifest,label); }
    static Context context(String name,Fixture builtin) throws Exception {
        File location=new File(root,name); write(new File(location,"assets/content-update/public-key.der"),key.getPublic().getEncoded());
        write(new File(location,"assets/content-update/builtin-channel.json"),builtin.channel());
        for(Map.Entry<String,byte[]> entry:builtin.files.entrySet()) write(new File(location,"assets/www/"+entry.getKey()),entry.getValue());
        return new Context(location);
    }
    static void install(ContentResourceStore store,Fixture fixture) throws Exception {
        ContentManifest manifest=fixture.manifest();
        for(ContentManifest.Pack pack:manifest.packages.values()) if(!store.hasPack(pack)) {
            File archive=new File(store.directory,"fixture.zip"); write(archive,fixture.archives.get(pack.id)); store.unpack(pack,archive); archive.delete();
        }
        store.installSnapshot(manifest);
    }
    static void packageBehavior() throws Exception {
        Fixture base=fixture(1,"export const score=1;"), next=fixture(2,"export const score=2;");
        ContentResourceStore store=new ContentResourceStore(context("packages",base),3); ContentManifest m=next.manifest();
        int missing=0; for(ContentManifest.Pack pack:m.packages.values()) if(!store.hasPack(pack)) missing++;
        check(missing==1,"only changed game pack needs download; unchanged core/art/five locales reuse APK");
        rejects(()->store.installSnapshot(m),"cannot install missing package");
        check(!store.installed(m.id),"incomplete snapshot not routable");
        install(store,next);
        String path="updates/"+m.id+"/www/src/games/match3.js";
        check(read(store.openPath(path)).equals("export const score=2;"),"new immutable snapshot serves new game");
        check(read(store.openPath("www/src/games/match3.js")).equals("export const score=1;"),"existing builtin page keeps old game");
        rejects(()->store.openPath("updates/"+m.id+"/www/src/undeclared.js"),"undeclared snapshot file");
        rejects(()->store.openPath("updates/"+"f".repeat(64)+"/www/standalone/index.html"),"unverified snapshot ID");
        ContentManifest.Pack pack=m.packages.get("game.match3"); File resource=new File(store.directory,"objects/"+pack.sha256+"/src/games/match3.js");
        write(resource,"export const score=9;".getBytes(StandardCharsets.UTF_8));
        check(!store.hasPack(pack),"same-size corrupted cache is eligible for re-download");
        rejects(()->new ContentResourceStore(context("packages",base),3).loadInstalled(m.id),"startup rechecks cached file hashes");
        install(store,next); check(read(store.openPath(path)).contains("score=2"),"damaged cache can be repaired");
        byte[] good=next.archives.get(pack.id); byte[] bad=good.clone(); bad[bad.length/2]^=1; File archive=new File(store.directory,"bad.zip"); write(archive,bad);
        rejects(()->store.unpack(pack,archive),"wrong archive digest");
        for(String malicious:Arrays.asList("../outside.txt","src/extra.js","/absolute.txt")) {
            Fixture extra=fixture(3,"game"); Map<String,byte[]> entries=new LinkedHashMap<>(); entries.put("src/games/match3.js","game".getBytes(StandardCharsets.UTF_8)); entries.put(malicious,new byte[]{1});
            replaceArchive(extra,"game.match3",zip(entries)); write(archive,extra.archives.get("game.match3"));
            rejects(()->store.unpack(extra.manifest().packages.get("game.match3"),archive),"undeclared/traversal member "+malicious);
        }
        Fixture missingFile=fixture(3,"game"); replaceArchive(missingFile,"game.match3",zip(Collections.emptyMap())); write(archive,missingFile.archives.get("game.match3"));
        rejects(()->store.unpack(missingFile.manifest().packages.get("game.match3"),archive),"missing declared ZIP member");
        Fixture wrongFile=fixture(3,"game"); replaceArchive(wrongFile,"game.match3",zip(Collections.singletonMap("src/games/match3.js","evil".getBytes(StandardCharsets.UTF_8)))); write(archive,wrongFile.archives.get("game.match3"));
        rejects(()->store.unpack(wrongFile.manifest().packages.get("game.match3"),archive),"correct archive hash but wrong file hash");
        Fixture duplicate=fixture(3,"game"); Map<String,byte[]> members=new LinkedHashMap<>(); members.put("src/games/match3.js","game".getBytes(StandardCharsets.UTF_8)); members.put("src/games/matchX.js","game".getBytes(StandardCharsets.UTF_8));
        byte[] duplicateZip=zip(members), search="matchX.js".getBytes(StandardCharsets.UTF_8);
        for(int i=0;i<duplicateZip.length-search.length;i++) { boolean same=true; for(int j=0;j<search.length;j++) if(duplicateZip[i+j]!=search[j])same=false; if(same)duplicateZip[i+5]='3'; }
        replaceArchive(duplicate,"game.match3",duplicateZip); write(archive,duplicateZip);
        rejects(()->store.unpack(duplicate.manifest().packages.get("game.match3"),archive),"duplicate declared ZIP member");
        check(!new File(store.directory,"outside.txt").exists(),"no file escaped extraction directory");
        File dangling=new File(store.directory,"objects/orphan/data"); write(dangling,new byte[]{9});
        store.collect(new HashSet<>(Arrays.asList(store.builtinId(),m.id)));
        check(!dangling.exists() && store.hasPack(pack),"GC removes only unreferenced package cache");
    }
    static void replaceArchive(Fixture fixture,String id,byte[] bytes) throws Exception {
        fixture.archives.put(id,bytes);
        for(Object value:fixture.payload.getJSONArray("packages")) { JSONObject pack=(JSONObject)value; if(id.equals(pack.getString("id"))) pack.put("sha256",ContentManifest.sha256(bytes)).put("size",bytes.length); }
    }
    static JSONObject storage() { JSONObject s=new JSONObject(); for(String key:STORAGE) s.put("wanbanXiaowu_"+key+"_v1",key.equals("progress")?"{\"match3\":{\"coins\":73,\"moves\":0}}":JSONObject.NULL); return s; }
    static void recoveryBehavior() throws Exception {
        Fixture base=fixture(1,"one"),next=fixture(2,"two"); Context context=context("recovery",base); ContentResourceStore store=new ContentResourceStore(context,3); install(store,next);
        JSONObject persisted=new JSONObject().put("active",next.manifest().id).put("previous",base.manifest().id).put("pending",true);
        ContentResourceStore.writeAtomic(new File(store.directory,"active.json"),persisted.toString().getBytes(StandardCharsets.UTF_8));
        ContentResourceStore.writeAtomic(new File(store.directory,"checkpoint.json"),storage().toString().getBytes(StandardCharsets.UTF_8));
        ContentResourceStore.writeAtomic(new File(store.directory,"candidate.json"),next.channel());
        Events events=new Events(); ContentUpdateManager manager=new ContentUpdateManager(context,3,events);
        try {
            check(events.loaded().equals("/assets/www/standalone/index.html"),"cold crash during activation loads old complete snapshot");
            JSONObject state=new JSONObject(manager.getContentState());
            check(state.getString("activeSnapshotId").equals(base.manifest().id),"active pointer restored");
            check(state.getJSONObject("restoreStorage").similar(storage()),"checkpoint carries original raw save strings including null keys");
            check(!state.getBoolean("bootHealthy"),"restoration must be acknowledged before new game input is allowed");
            check(state.isNull("candidate"),"failed startup candidate is not offered again");
            manager.downloadGameUpdate(next.manifest().id); check(events.event("error").getString("message").contains("失败"),"failed candidate cannot be reactivated");
            manager.reportGameContentReady(base.manifest().id); events.event("active");
            check(new JSONObject(manager.getContentState()).isNull("restoreStorage"),"healthy restored app clears one-time save restoration");
            check(new JSONObject(manager.getContentState()).getBoolean("bootHealthy"),"restored health is durable before exposure");
        } finally {manager.close();}
        Events restarted=new Events(); manager=new ContentUpdateManager(context,3,restarted);
        try { restarted.loaded(); check(new JSONObject(manager.getContentState()).isNull("restoreStorage"),"later normal launch never overwrites newly earned saves"); }
        finally {manager.close();}
    }
    static void activationAndWatchdog() throws Exception {
        Fixture base=fixture(1,"one"),next=fixture(2,"two"); Context context=context("activation",base); ContentResourceStore store=new ContentResourceStore(context,3); install(store,next);
        ContentResourceStore.writeAtomic(new File(store.directory,"candidate.json"),next.channel());
        Events events=new Events(); ContentUpdateManager manager=new ContentUpdateManager(context,3,events);
        try {
            events.loaded(); String id=next.manifest().id; JSONObject checkpoint=new JSONObject().put("ok",true).put("idle",true).put("storage",storage());
            manager.activateGameUpdate(id,checkpoint.put("idle",false).toString()); events.event("error");
            check(new JSONObject(manager.getContentState()).getString("activeSnapshotId").equals(base.manifest().id),"active game rejects activation without idle save checkpoint");
            awaitIdle(manager); manager.activateGameUpdate(id,checkpoint.put("idle",true).toString()); events.event("activating");
            check(events.loaded().contains("/updates/"+id+"/"),"activation changes complete immutable entry");
            JSONObject durable=new JSONObject(new String(ContentResourceStore.readAtomic(new File(store.directory,"active.json"),32768),StandardCharsets.UTF_8));
            check(durable.getBoolean("pending") && durable.getString("previous").equals(base.manifest().id),"active transaction durably records previous snapshot before reload");
            manager.onPause(); Handler.fireTimers(); Thread.sleep(50);
            check(new JSONObject(manager.getContentState()).getString("activeSnapshotId").equals(id),"background time does not trip startup watchdog");
            manager.onResume(); Handler.fireTimers(); events.event("rolledBack"); events.loaded();
            check(new JSONObject(manager.getContentState()).getJSONObject("restoreStorage").similar(storage()),"foreground unhealthy boot rolls back with checkpoint");
            check(new JSONObject(manager.reportGameContentReady(id)).has("error"),"late health acknowledgment from failed entry cannot commit it");
        } finally { manager.close(); }

        context=context("manual",base); store=new ContentResourceStore(context,3); install(store,next); ContentResourceStore.writeAtomic(new File(store.directory,"candidate.json"),next.channel());
        events=new Events(); manager=new ContentUpdateManager(context,3,events);
        try {
            events.loaded(); String id=next.manifest().id; manager.activateGameUpdate(id,new JSONObject().put("ok",true).put("idle",true).put("storage",storage()).toString()); events.event("activating"); events.loaded();
            android.util.AtomicFile.failNextFinish=true;
            manager.reportGameContentReady(id); events.event("error");
            check(!new JSONObject(manager.getContentState()).getBoolean("bootHealthy"),"failed health marker write never unlocks gameplay");
            manager.reportGameContentReady(id); events.event("active"); awaitIdle(manager);
            manager.rollbackGameUpdate(); events.event("rolledBack"); events.loaded();
            check(new JSONObject(manager.getContentState()).isNull("restoreStorage"),"manual rollback of healthy content preserves the player's newer save data");
        } finally {manager.close();}
    }
    static void downloadAndReplay() throws Exception {
        Fixture base=fixture(1,"one"),next=fixture(2,"two"); Context context=context("download",base); ContentManifest nextManifest=next.manifest();
        responses.clear(); requested.clear(); responses.put(CHANNEL,next.channel());
        ContentManifest.Pack changed=nextManifest.packages.get("game.match3"); responses.put(changed.url,new byte[]{0,1});
        Events events=new Events(); ContentUpdateManager manager=new ContentUpdateManager(context,3,events);
        try {
            events.loaded(); check(new JSONObject(manager.checkGameUpdates()).has("jobId"),"check launches serialized native job"); events.event("available"); awaitIdle(manager);
            JSONObject state=new JSONObject(manager.getContentState()); check(state.getJSONObject("candidate").getString("snapshotId").equals(nextManifest.id),"signature-verified channel becomes candidate");
            check(state.getJSONObject("job").getLong("totalBytes")==changed.size,"download estimate includes only changed game ZIP");
            manager.downloadGameUpdate(nextManifest.id); events.event("error"); awaitIdle(manager);
            check(new JSONObject(manager.getContentState()).getString("activeSnapshotId").equals(base.manifest().id),"truncated download retains playable old entry");
            File temporary=new File(context.getNoBackupFilesDir(),"content-update/.download-"+changed.sha256+".part"); check(!temporary.exists(),"failed partial archive removed");
            responses.put(changed.url,next.archives.get(changed.id)); requested.clear();
            manager.downloadGameUpdate(nextManifest.id); events.event("ready"); awaitIdle(manager);
            check(requested.equals(Collections.singletonList(changed.url)),"real updater transport requests only one changed game package");
            check(read(manager.openResource("updates/"+nextManifest.id+"/www/src/games/match3.js")).equals("two"),"downloaded file becomes readable only after full snapshot verification");
            check(new JSONObject(manager.getContentState()).getString("activeSnapshotId").equals(base.manifest().id),"download completion does not change running game's entry");
        } finally { manager.close(); }
        // Cached candidate cannot bypass the durable anti-replay sequence on a later launch.
        File directory=new File(context.getNoBackupFilesDir(),"content-update"); ContentResourceStore.writeAtomic(new File(directory,"candidate.json"),base.channel()); responses.put(CHANNEL,base.channel());
        events=new Events(); manager=new ContentUpdateManager(context,3,events);
        try {
            events.loaded(); check(new JSONObject(manager.getContentState()).isNull("candidate"),"stale signed disk candidate cannot bypass anti-replay");
            manager.checkGameUpdates(); check(events.event("error").getString("message").contains("序号"),"remote rollback sequence rejected");
        } finally {manager.close();}
        Fixture conflicting=fixture(2,"different bytes under already seen release sequence"); responses.put(CHANNEL,conflicting.channel());
        events=new Events(); manager=new ContentUpdateManager(context,3,events);
        try { events.loaded(); manager.checkGameUpdates(); check(events.event("error").getString("message").contains("序号"),"same sequence cannot be republished with different signed bytes"); }
        finally {manager.close();}
    }
    static void awaitIdle(ContentUpdateManager manager) throws Exception {
        java.lang.reflect.Field field=ContentUpdateManager.class.getDeclaredField("busy"); field.setAccessible(true);
        java.util.concurrent.atomic.AtomicBoolean busy=(java.util.concurrent.atomic.AtomicBoolean)field.get(manager);
        long end=System.currentTimeMillis()+5000; while(busy.get()&&System.currentTimeMillis()<end) Thread.sleep(1);
        check(!busy.get(),"update job completes");
    }
    static void redirectAndRoutes() throws Exception {
        for(String path:Arrays.asList("../src/a.js","src/../a.js","src/%2e%2e/a.js","src\\a.js","/src/a.js","src/.hidden","src/engine.so","src/engine.dex","standalone/")) check(!ContentManifest.validPath(path),"unsafe logical path rejected: "+path);
        for(String url:Arrays.asList("http://github.com/JackLee992/USER_HOUSE_GAME_PACKS/releases/download/content-1/a.zip","https://github.com:443/JackLee992/USER_HOUSE_GAME_PACKS/releases/download/content-1/a.zip","https://github.com@evil.test/x","https://release-assets.githubusercontent.com.evil.test/a","https://github.com/other/repo/releases/download/content-1/a.zip")) check(!ContentUpdateManager.safeRedirect(new URI(url)),"unsafe redirect rejected: "+url);
        check(ContentUpdateManager.safeRedirect(new URI("https://release-assets.githubusercontent.com/github-production-release-asset/a?sig=test")),"official signed asset CDN redirect permitted");
        String id="a".repeat(64), url=LocalAssetPolicy.ORIGIN+"/assets/updates/"+id+"/www/assets/space-cadet/space-cadet.wasm?v=1";
        check(LocalAssetPolicy.assetPath(url).equals("updates/"+id+"/www/assets/space-cadet/space-cadet.wasm"),"same-origin snapshot WASM route");
        check(LocalAssetPolicy.assetPath(url.replace(id,"z".repeat(64)))==null,"invalid snapshot route rejected");
        check(LocalAssetPolicy.assetPath(url.replace("space-cadet.wasm","%2e%2e/private"))==null,"encoded traversal route rejected");
    }
    static void write(File file,byte[] bytes) throws Exception { file.getParentFile().mkdirs(); Files.write(file.toPath(),bytes); }
    static String read(InputStream input) throws Exception { try(InputStream in=input) { return new String(in.readAllBytes(),StandardCharsets.UTF_8); } }
    static void check(boolean condition,String label) { assertions++; if(!condition) throw new AssertionError(label); }
    static void rejects(Checked operation,String label) throws Exception { try { operation.run(); } catch(Exception expected) { assertions++; return; } throw new AssertionError("must reject: "+label); }
}
