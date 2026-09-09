import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const repo = fileURLToPath(new URL('../../../../..', import.meta.url));
const jdk = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const jsonJar = process.env.WANBA_JSON_JAR || '/tmp/wanba-content-tests/json.jar';

// Android's android.jar has throwing org.json stubs. Run the actual updater against
// org.json:json:20240303; the small Android adapters below only provide host IO/queue APIs.
test('real Java signature, package verification and update recovery behavior', {timeout: 60000}, async () => {
  assert.ok(existsSync(jsonJar), 'Set WANBA_JSON_JAR to org.json:json:20240303 (test-only Maven dependency)');
  const root = await mkdtemp(join(tmpdir(), 'wanba-update-java-'));
  try {
    const adapters = {
      'io/github/jacklee992/wanba/BuildConfig.java': 'package io.github.jacklee992.wanba; public final class BuildConfig { public static final boolean WANBA_GAME_UPDATES = true; }',
      'android/content/Context.java': `package android.content;
        public class Context {
          private final java.io.File root;
          public Context(java.io.File root) { this.root=root; }
          public Context getApplicationContext() { return this; }
          public android.content.res.AssetManager getAssets() { return new android.content.res.AssetManager(new java.io.File(root,"assets")); }
          public java.io.File getNoBackupFilesDir() { return new java.io.File(root,"private"); }
        }`,
      'android/content/res/AssetManager.java': `package android.content.res;
        public class AssetManager {
          private final java.io.File root;
          public AssetManager(java.io.File root) { this.root=root; }
          public java.io.InputStream open(String path) throws java.io.IOException { return new java.io.FileInputStream(new java.io.File(root,path)); }
        }`,
      'android/util/AtomicFile.java': `package android.util;
        public class AtomicFile {
          public static volatile boolean failNextFinish;
          private final java.io.File file, next;
          public AtomicFile(java.io.File file) { this.file=file; next=new java.io.File(file+".new"); }
          public java.io.FileOutputStream startWrite() throws java.io.IOException { return new java.io.FileOutputStream(next); }
          public void finishWrite(java.io.FileOutputStream out) throws java.io.IOException { if(failNextFinish) { failNextFinish=false; throw new java.io.IOException("simulated full disk"); } out.getFD().sync(); out.close(); java.nio.file.Files.move(next.toPath(),file.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING); }
          public void failWrite(java.io.FileOutputStream out) { try { out.close(); } catch(Exception ignored) {} next.delete(); }
          public java.io.FileInputStream openRead() throws java.io.IOException { return new java.io.FileInputStream(file); }
        }`,
      'android/os/Looper.java': `package android.os; public class Looper { public static Looper getMainLooper(){return new Looper();} }`,
      'android/os/Handler.java': `package android.os;
        public class Handler {
          private static final java.util.Map<Runnable,Boolean> delayed = new java.util.concurrent.ConcurrentHashMap<>();
          public Handler(Looper looper) {}
          public boolean post(Runnable runnable) { runnable.run(); return true; }
          public boolean postDelayed(Runnable runnable,long delay) { delayed.put(runnable,true); return true; }
          public void removeCallbacks(Runnable runnable) { delayed.remove(runnable); }
          public static void fireTimers() { for(Runnable runnable:delayed.keySet()) if(delayed.remove(runnable)!=null) runnable.run(); }
        }`,
    };
    for (const [path, source] of Object.entries(adapters)) { await mkdir(join(root, path, '..'), {recursive:true}); await writeFile(join(root,path), source); }
    const fixtures = join(repo,'android/app/src/compat/tests/java/ContentUpdateBehavior.java');
    const javaRoot = join(repo,'android/app/src/main/java/io/github/jacklee992/wanba');
    const classes = join(root, 'classes'); await mkdir(classes);
    execFileSync(join(jdk,'bin/javac'), ['-cp',jsonJar,'-d',classes,...Object.keys(adapters).map(path=>join(root,path)),
      ...['ContentManifest','ContentResourceStore','ContentUpdateManager','LocalAssetPolicy'].map(name=>join(javaRoot,`${name}.java`)),fixtures], {encoding:'utf8'});
    const output = execFileSync(join(jdk,'bin/java'), ['-cp',`${classes}:${jsonJar}`,'io.github.jacklee992.wanba.ContentUpdateBehavior',root], {encoding:'utf8',timeout:45000});
    assert.match(output,/PASS \d+ real Java assertions/);
    process.stdout.write(output);
    // Compile again with the actual constant OFF, rather than changing a
    // runtime preference or merely hiding the JavaScript update controls.
    await writeFile(join(root,'io/github/jacklee992/wanba/BuildConfig.java'),adapters['io/github/jacklee992/wanba/BuildConfig.java'].replace('= true','= false'));
    const disabledClasses=join(root,'disabled-classes');await mkdir(disabledClasses);
    execFileSync(join(jdk,'bin/javac'), ['-cp',jsonJar,'-d',disabledClasses,...Object.keys(adapters).map(path=>join(root,path)),
      ...['ContentManifest','ContentResourceStore','ContentUpdateManager','LocalAssetPolicy'].map(name=>join(javaRoot,`${name}.java`)),fixtures], {encoding:'utf8'});
    const disabled=execFileSync(join(jdk,'bin/java'), ['-cp',`${disabledClasses}:${jsonJar}`,'io.github.jacklee992.wanba.ContentUpdateBehavior',root], {encoding:'utf8',timeout:15000});
    assert.match(disabled,/PASS \d+ disabled-update Java assertions/);process.stdout.write(disabled);
  } finally { await rm(root,{recursive:true,force:true}); }
});
