import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {makeDelta,applyDelta} from '../tools/app-updater/build-update.mjs';
import {zipFiles} from '../tools/content/build-packs.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url));

test('COPY/ADD reconstructs every signed-container byte including shifted entries and trailing APK metadata',()=>{
  const unchanged=Buffer.from(Array.from({length:40000},(_,i)=>(i*17+i%51)%256));
  const old=zipFiles([{path:'classes.dex',bytes:Buffer.from('old')},{path:'assets/large.bin',bytes:unchanged}]);
  const next=zipFiles([{path:'classes.dex',bytes:Buffer.from('a longer new dex')},{path:'assets/new.txt',bytes:Buffer.from('new')},{path:'assets/large.bin',bytes:unchanged}]);
  const {patch,copiedBytes}=makeDelta(old,next);assert.ok(copiedBytes>0);assert.deepEqual(applyDelta(old,patch),next);
  assert.throws(()=>applyDelta(old,Buffer.concat([patch,Buffer.from([1])])));
  assert.throws(()=>applyDelta(old,patch.subarray(0,patch.length-1)));
});
test('production Java verifies signatures and rejects malformed/cancelled streaming patches',{timeout:60000},async()=>{
  const jdk=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const json=process.env.WANBA_JSON_JAR||'/tmp/wanba-content-tests/json.jar';
  const out=await mkdtemp(join(tmpdir(),'wanba-apk-update-tests-'));
  try{
    const source=join(repo,'android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater');
    execFileSync(join(jdk,'bin/javac'),['-cp',json,'-d',out,...['UpdateFiles','UpdateProtocol','DownloadAccounting'].map(n=>join(source,n+'.java')),join(repo,'android/app-updater/src/test/java/io/github/jacklee992/wanba/appupdater/AppUpdaterBehavior.java')],{encoding:'utf8'});
    const result=execFileSync(join(jdk,'bin/java'),['-cp',out+':'+json,'io.github.jacklee992.wanba.appupdater.AppUpdaterBehavior'],{encoding:'utf8',timeout:30000});
    assert.match(result,/PASS \d+ real Java APK-update assertions/);process.stdout.write(result);
  }finally{await rm(out,{recursive:true,force:true});}
});
test('default build excludes optional installer module and trust is the existing public key',async()=>{
  const settings=await readFile(join(repo,'android/settings.gradle.kts'),'utf8');
  assert.match(settings,/gradleProperty\("wanbaAppUpdater"\)\.orElse\("false"\)/);
  const permission=await readFile(join(repo,'android/app-updater/src/main/AndroidManifest.xml'),'utf8');assert.match(permission,/REQUEST_INSTALL_PACKAGES/);assert.match(permission,/android:exported="false"/);
  assert.deepEqual(await readFile(join(repo,'android/app-updater/src/main/assets/app-updater/public-key.der')),await readFile(join(repo,'android/app/src/main/assets/content-update/public-key.der')));
});
