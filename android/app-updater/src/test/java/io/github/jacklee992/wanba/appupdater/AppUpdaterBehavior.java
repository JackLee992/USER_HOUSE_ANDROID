package io.github.jacklee992.wanba.appupdater;

import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Real JVM execution of the production manifest verifier and streaming decoder. No Android mock installers. */
public final class AppUpdaterBehavior {
    static int assertions;
    interface Throwing { void run() throws Exception; }
    static void check(boolean ok) { assertions++; if (!ok) throw new AssertionError("assertion " + assertions); }
    static void rejected(Throwing work) throws Exception { boolean rejected=false; try { work.run(); } catch (IOException | JSONException | GeneralSecurityException | IllegalArgumentException expected) { rejected=true; } check(rejected); }
    static JSONObject asset() throws Exception { return new JSONObject().put("url","https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/download/v1.3.0/app.apk").put("size",100).put("sha256","a".repeat(64)); }
    static JSONObject payload() throws Exception {
        JSONObject entry=new JSONObject().put("packageName","io.github.jacklee992.wanba").put("versionCode",5).put("versionName","1.3.0").put("minSdk",26).put("signerSha256","b".repeat(64)).put("full",asset());
        return new JSONObject().put("schema",1).put("kind","wanba-apk-update").put("repository",UpdateProtocol.REPOSITORY).put("sequence",1).put("issuedAt",100000).put("expiresAt",200000).put("apps",new JSONArray().put(entry));
    }
    static byte[] signed(JSONObject payload,KeyPair pair) throws Exception {
        byte[] bytes=payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(bytes);
        return new JSONObject().put("schema",1).put("payload",Base64.getEncoder().encodeToString(bytes)).put("signature",Base64.getEncoder().encodeToString(signer.sign())).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
    static byte[] patch(long size,ThrowingWriter writer) throws Exception { ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);out.write(UpdateFiles.MAGIC);out.writeLong(size);writer.write(out);out.flush();return bytes.toByteArray(); }
    interface ThrowingWriter { void write(DataOutputStream out) throws Exception; }
    public static void main(String[] args) throws Exception {
        if(args.length==4){UpdateFiles.reconstruct(new File(args[0]),new File(args[1]),new File(args[2]),Long.parseLong(args[3]),new AtomicBoolean());System.out.println(UpdateFiles.hash(new File(args[2]),new AtomicBoolean()));return;}
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));KeyPair pair=generator.generateKeyPair();byte[] trust=pair.getPublic().getEncoded();
        JSONObject good=payload();UpdateProtocol p=new UpdateProtocol(signed(good,pair),trust,"io.github.jacklee992.wanba",150000);check(p.entry.versionCode==5&&p.sequence==1);
        DownloadAccounting traffic=new DownloadAccounting();traffic.received(true,123);
        check(traffic.summary(true,1000).contains("增量下载成功：123 字节")&&traffic.summary(true,1000).contains("完整 APK 1000 字节"));
        traffic.received(false,1000);check(traffic.summary(false,1000).contains("补丁尝试 123 字节，累计 1123 字节"));
        DownloadAccounting direct=new DownloadAccounting();direct.received(false,1000);check(direct.summary(false,1000).startsWith("完整包下载成功：1000 字节"));
        DownloadAccounting failedBeforeBody=new DownloadAccounting();failedBeforeBody.patchAttempted=true;failedBeforeBody.received(false,1000);check(failedBeforeBody.summary(false,1000).contains("补丁尝试 0 字节，累计 1000 字节"));
        UpdateProtocol.checkSequence(p,1,p.payloadHash);check(true);
        rejected(()->UpdateProtocol.checkSequence(p,2,p.payloadHash));
        rejected(()->UpdateProtocol.checkSequence(p,1,"c".repeat(64)));
        rejected(()->new UpdateProtocol(signed(good,generator.generateKeyPair()),trust,"io.github.jacklee992.wanba",150000));
        rejected(()->new UpdateProtocol(new byte[UpdateProtocol.MAX_MANIFEST+1],trust,"io.github.jacklee992.wanba",150000));
        rejected(()->new UpdateProtocol(signed(payload().put("kind","game-content"),pair),trust,"io.github.jacklee992.wanba",150000));
        rejected(()->new UpdateProtocol(signed(payload(),pair),trust,"io.github.jacklee992.wanba",200001));
        rejected(()->new UpdateProtocol(signed(payload(),pair),trust,"io.github.jacklee992.wanba.compat",150000));
        rejected(()->new UpdateProtocol(signed(payload().put("sequence",1.5),pair),trust,"io.github.jacklee992.wanba",150000));
        JSONObject duplicate=payload();duplicate.getJSONArray("apps").put(duplicate.getJSONArray("apps").getJSONObject(0));rejected(()->new UpdateProtocol(signed(duplicate,pair),trust,"io.github.jacklee992.wanba",150000));
        JSONObject huge=payload();huge.getJSONArray("apps").getJSONObject(0).getJSONObject("full").put("size",UpdateProtocol.MAX_APK+1);rejected(()->new UpdateProtocol(signed(huge,pair),trust,"io.github.jacklee992.wanba",150000));
        JSONObject wrong=payload();wrong.getJSONArray("apps").getJSONObject(0).getJSONObject("full").put("url","https://github.com/evil/repo/releases/download/x/x.apk");rejected(()->new UpdateProtocol(signed(wrong,pair),trust,"io.github.jacklee992.wanba",150000));
        check(UpdateProtocol.validRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/a?token=x"));
        for(String bad:new String[]{"http://github.com/JackLee992/USER_HOUSE_ANDROID/releases/download/v/a.apk","https://github.com.evil.invalid/JackLee992/USER_HOUSE_ANDROID/releases/download/v/a.apk","https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/download/v/%2e%2e/a.apk","https://github.com:444/JackLee992/USER_HOUSE_ANDROID/releases/download/v/a.apk","https://user@github.com/JackLee992/USER_HOUSE_ANDROID/releases/download/v/a.apk","https://127.0.0.1/a.apk","file:///a.apk","https://example.com/a.apk"})check(!UpdateProtocol.validRedirect(bad));
        Path dir=Files.createTempDirectory("wanba-apk-decoder-");File base=dir.resolve("base").toFile(),delta=dir.resolve("patch").toFile(),out=dir.resolve("out").toFile();
        try {
            Files.write(base.toPath(),"0123456789".getBytes());
            Files.write(delta.toPath(),patch(6,d->{d.writeByte(1);d.writeLong(2);d.writeInt(3);d.writeByte(2);d.writeInt(3);d.writeBytes("ABC");d.writeByte(0);}));
            UpdateFiles.reconstruct(base,delta,out,6,new AtomicBoolean());check(Files.readString(out.toPath()).equals("234ABC"));
            byte[] valid=Files.readAllBytes(delta.toPath());
            for(byte[] corrupt:new byte[][]{
                patch(6,d->d.writeByte(0)),patch(6,d->{d.writeByte(1);d.writeLong(-1);d.writeInt(6);d.writeByte(0);}),
                patch(6,d->{d.writeByte(1);d.writeLong(Long.MAX_VALUE);d.writeInt(6);d.writeByte(0);}),
                patch(6,d->{d.writeByte(1);d.writeLong(8);d.writeInt(6);d.writeByte(0);}),
                patch(6,d->{d.writeByte(2);d.writeInt(Integer.MAX_VALUE);}),patch(6,d->{d.writeByte(2);d.writeInt(-1);}),
                patch(6,d->{d.writeByte(2);d.writeInt(0);}),patch(6,d->d.writeByte(7)),Arrays.copyOf(valid,valid.length-2),Arrays.copyOf(valid,valid.length+1)}){
                Files.write(delta.toPath(),corrupt);rejected(()->UpdateFiles.reconstruct(base,delta,out,6,new AtomicBoolean()));check(!out.exists());
            }
            Files.write(delta.toPath(),valid);rejected(()->UpdateFiles.reconstruct(base,delta,out,7,new AtomicBoolean()));
            rejected(()->UpdateFiles.reconstruct(base,delta,out,6,new AtomicBoolean(true)));check(!out.exists());
            // Cancel after reconstruction actually starts writing, then require removal of the partial APK.
            try(RandomAccessFile file=new RandomAccessFile(base,"rw")){file.setLength(128L*1024*1024);}
            Files.write(delta.toPath(),patch(128L*1024*1024,d->{d.writeByte(1);d.writeLong(0);d.writeInt(128*1024*1024);d.writeByte(0);}));
            AtomicBoolean cancel=new AtomicBoolean();Thread cancellation=new Thread(()->{long end=System.nanoTime()+5_000_000_000L;while(out.length()==0&&System.nanoTime()<end)Thread.yield();cancel.set(true);});cancellation.start();
            rejected(()->UpdateFiles.reconstruct(base,delta,out,128L*1024*1024,cancel));cancellation.join();check(!out.exists());
        } finally { for(File f:Objects.requireNonNull(dir.toFile().listFiles()))f.delete();dir.toFile().delete(); }
        System.out.println("PASS "+assertions+" real Java APK-update assertions");
    }
}
