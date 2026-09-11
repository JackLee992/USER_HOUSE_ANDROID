import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {APP_VERSION} from '../standalone/app-info.js';
const root=fileURLToPath(new URL('../',import.meta.url));

test('the real Java URL policy denies external/traversal requests and serves web binary MIME types',t=>{
 const directory=mkdtempSync(join(tmpdir(),'wanba-policy-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const jdk=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home';
 const binary=name=>existsSync(join(jdk,'bin',name))?join(jdk,'bin',name):name;
 const source=`package io.github.jacklee992.wanba;
 public final class PolicyChecks {
  static void equal(Object a,Object b){if(!java.util.Objects.equals(a,b))throw new AssertionError(a+" != "+b);}
  public static void main(String[] args){
   equal(LocalAssetPolicy.compatibleWebView("123.0.0"),false);equal(LocalAssetPolicy.compatibleWebView("124.0.6367.179"),true);equal(LocalAssetPolicy.compatibleWebView("999.1"),true);equal(LocalAssetPolicy.compatibleWebView(null),false);equal(LocalAssetPolicy.compatibleWebView("unknown"),false);
   equal(LocalAssetPolicy.chromiumVersion("Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36"),"114.0.5735.196");
   equal(LocalAssetPolicy.chromiumVersion("Mozilla/5.0 Chrome/140.0.0.0 Mobile Safari/537.36"),"140.0.0.0");
   equal(LocalAssetPolicy.chromiumVersion("12.1.1.324"),null);equal(LocalAssetPolicy.chromiumVersion(null),null);
   equal(LocalAssetPolicy.compatibleWebView(LocalAssetPolicy.chromiumVersion("Mozilla/5.0 Chrome/140.0.0.0 Huawei/12.1.1.324")),true);
   equal(LocalAssetPolicy.assetPath(LocalAssetPolicy.ENTRY),"www/standalone/index.html");
   equal(LocalAssetPolicy.isEntry(LocalAssetPolicy.ENTRY+"#games"),true);
   equal(LocalAssetPolicy.assetPath(LocalAssetPolicy.ORIGIN+"/assets/www/assets/space-cadet/space-cadet.wasm?v=1"),"www/assets/space-cadet/space-cadet.wasm");
   for(String url:new String[]{"https://example.org/assets/www/standalone/index.html","http://appassets.androidplatform.net/assets/www/standalone/index.html","https://user@appassets.androidplatform.net/assets/www/standalone/index.html","https://appassets.androidplatform.net:8080/assets/www/src/main.js","file:///android_asset/www/standalone/index.html","content://files/private.json","data:text/html,evil",LocalAssetPolicy.ORIGIN+"/assets/www/src/../private.js",LocalAssetPolicy.ORIGIN+"/assets/www/src/%2e%2e/private.js",LocalAssetPolicy.ORIGIN+"/assets/www/src/%252e%252e/private.js",LocalAssetPolicy.ORIGIN+"/assets/www/assets/pets/cat.png",LocalAssetPolicy.ORIGIN+"/assets/www/.git/config"})equal(LocalAssetPolicy.assetPath(url),null);
   equal(LocalAssetPolicy.mimeType("space-cadet.js"),"text/javascript");equal(LocalAssetPolicy.mimeType("space-cadet.wasm"),"application/wasm");equal(LocalAssetPolicy.mimeType("space-cadet.data"),"application/octet-stream");equal(LocalAssetPolicy.mimeType("SOUND.WAV"),"audio/wav");
   equal(LocalAssetPolicy.isEntry(LocalAssetPolicy.ORIGIN+"/assets/www/src/other.html"),false);
  }
 }`;
 writeFileSync(join(directory,'PolicyChecks.java'),source);
 const compile=spawnSync(binary('javac'),['-d',directory,join(root,'android/app/src/main/java/io/github/jacklee992/wanba/LocalAssetPolicy.java'),join(directory,'PolicyChecks.java')],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
 const run=spawnSync(binary('java'),['-cp',directory,'io.github.jacklee992.wanba.PolicyChecks'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
});
test('the Android shell permits native content downloads without storage permissions and signs only through external properties',()=>{
 const manifest=readFileSync(join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');assert.deepEqual([...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map(m=>m[1]),['android.permission.INTERNET']);assert.match(manifest,/android:allowBackup="false"/);
 const native=readFileSync(join(root,'android/app/src/main/java/io/github/jacklee992/wanba/MainActivity.java'),'utf8');assert.match(native,/setWebContentsDebuggingEnabled\(BuildConfig.DEBUG\)/);assert.match(native,/setBlockNetworkLoads\(true\)/);assert.doesNotMatch(native,/handler\.proceed\(|setAllowUniversalAccessFromFileURLs\(true\)/);
 const gradle=readFileSync(join(root,'android/app/build.gradle.kts'),'utf8');assert.match(gradle,/\.local\/signing.properties/);assert.match(gradle,/minorApiLevel = 1/);assert.match(gradle,/minSdk = 26/);
 assert.equal(/gradleProperty\("wanbaVersionName"\)\.orElse\("([^"]+)"\)/.exec(gradle)?.[1],APP_VERSION,'default native and web app versions agree');
 assert.equal(Number(/gradleProperty\("wanbaVersionCode"\)\.orElse\("(\d+)"\)/.exec(gradle)?.[1]),8,'1.3.1 native catalog release uses code8 after the code7 Android update');
});
