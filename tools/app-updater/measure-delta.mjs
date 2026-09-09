#!/usr/bin/env node
// Read-only inputs. Writes a patch and Java-reconstructed APK only beneath the requested QA output.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeDelta,sha256,inspectApk} from './build-update.mjs';
const [oldPath,newPath,output]=process.argv.slice(2);
if(!oldPath||!newPath||!output)throw Error('Usage: measure-delta.mjs OLD.apk NEW.apk QA_OUTPUT');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),jdk=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home',json=process.env.WANBA_JSON_JAR||'/tmp/wanba-content-tests/json.jar';
await mkdir(output,{recursive:true});
const old=await readFile(oldPath),next=await readFile(newPath),oldMeta=inspectApk(oldPath,{jdk}),newMeta=inspectApk(newPath,{jdk});
if(oldMeta.packageName!==newMeta.packageName||oldMeta.signerSha256!==newMeta.signerSha256||oldMeta.versionCode>=newMeta.versionCode)throw Error('APK identity/version mismatch');
const {patch,operations,copiedBytes}=makeDelta(old,next),patchPath=join(output,'update.waup'),rebuilt=join(output,'reconstructed.apk'),classes=join(output,'classes');
await writeFile(patchPath,patch,{flag:'wx'});await mkdir(classes,{recursive:true});
const source=join(root,'android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater');
execFileSync(join(jdk,'bin/javac'),['-cp',json,'-d',classes,...['UpdateFiles','UpdateProtocol','DownloadAccounting'].map(n=>join(source,n+'.java')),join(root,'android/app-updater/src/test/java/io/github/jacklee992/wanba/appupdater/AppUpdaterBehavior.java')],{encoding:'utf8'});
const reconstructedHash=execFileSync(join(jdk,'bin/java'),['-cp',classes+':'+json,'io.github.jacklee992.wanba.appupdater.AppUpdaterBehavior',oldPath,patchPath,rebuilt,String(next.length)],{encoding:'utf8'}).trim();
if(reconstructedHash!==sha256(next))throw Error('Java reconstruction hash mismatch');
const reconstructedMetadata=inspectApk(rebuilt,{jdk});
const report={old:{...oldMeta,bytes:old.length,sha256:sha256(old)},target:{...newMeta,bytes:next.length,sha256:sha256(next)},patch:{bytes:patch.length,sha256:sha256(patch),operations,copiedBytes,downloadRatio:patch.length/next.length},javaReconstruction:{sha256:reconstructedHash,apkSignatureVerified:true,metadata:reconstructedMetadata},scope:'Offline algorithm evidence; old APK does not gain an updater entry point. Frozen input APKs are read only.'};
await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
