// Final same-signature release handoff. Release is inspected by native UI/SAF only.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,adb,screenshot,activity} from './android-gecko.mjs';
import {touch,nativeNodes} from './android-native-select.mjs';
if(process.env.WANBA_ENGINE!=='compat'||!process.env.ADB_SERIAL)throw Error('Explicit authorized physical compat target required');
const out=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/release',raw=process.env.QA_PRIVATE||'.local/qa-zuma-classic-v2/release';mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const apk=process.env.RELEASE_APK||'.local/releases/v1.2.1/wanba-compat-1.2.1.apk',expectedHash='8988136f202cc8529ced7c06bb45a1c64ab8bf2d00ee630445591697e489ebc6',snapshot='7a122cbdc1df7cafba30cfb98269303b91da3f1089c81f028467cd9a4bd4e630';
const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1'),checks=[];let c=null,error=null;
const hash=v=>createHash('sha256').update(v).digest('hex');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const visible=n=>n.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1];function tap(n){assert(visible(n));const[x,y,r,b]=n.rect;adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1))}
async function find(test,scroll=false){for(let i=0;i<12;i++){const node=(await nativeNodes()).find(n=>visible(n)&&test(n));if(node)return node;if(scroll)adb('shell','input','swipe','540','1800','540','700','450');await sleep(250)}throw Error('Expected release native control not visible')}
try{
 if(process.env.QA_RELEASE_UI_ONLY!=='1'){
 assert.equal(hash(readFileSync(apk)),expectedHash,'Exact verified release artifact');
 let before;if(process.env.QA_RELEASE_RESUME==='1'){before=JSON.parse(readFileSync(raw+'/before.json'));}else{
 c=await connect();for(let i=0;i<4&&await c.evaluate('!!wanbaApp.inspect().game');i++){adb('shell','input','keyevent','4');await c.wait(300)}await touch(c,'[data-tab=single]');await c.evaluate('wanbaApp.pause();wanbaApp.save();true');adb('shell','input','keyevent','3');await c.wait(10000);
 before=await c.evaluate(`Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`);writeFileSync(raw+'/before.json',JSON.stringify(before,null,2));await c.close();c=null;
 writeFileSync(raw+'/install.txt',adb('install','-r',apk));}adb('shell','rm','-f','/data/local/tmp/io.github.jacklee992.wanba.compat-geckoview-config.yaml');adb('shell','am','start','-n',activity);await sleep(1500);
 const pkg=adb('shell','dumpsys','package','io.github.jacklee992.wanba.compat');assert(/versionName=1\.2\.1\b/.test(pkg));assert(/versionCode=4\b/.test(pkg));assert(!/flags=\[[^\]]*\bDEBUGGABLE\b/.test(pkg));
 const installed=adb('shell','pm','path','io.github.jacklee992.wanba.compat').trim().replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_~=+./-]+\/base\.apk$/.test(installed));const installedHash=adb('shell','sha256sum',installed).trim().split(/\s+/)[0];assert.equal(installedHash,expectedHash);
 checks.push({check:'Same-signature install-r release version1.2.1/code4; no DEBUGGABLE; installed base.apk hash matches verified artifact',installedSHA256:installedHash});
 // Existing normal SAF automation has no debug bridge dependency. All five
 // exported parsed items are saved only in the private directory.
 process.env.QA_OUT=out+'/saf';process.env.QA_PRIVATE=raw+'/saf';await import('./android-zuma-baseline.mjs');const backup=JSON.parse(readFileSync(raw+'/saf/saf-backup.json'));
 assert.equal(backup.content.snapshotId,snapshot,'Newer builtin4 adopted');for(const key of keys){const expected=JSON.parse(before[key]||'null');if(key.endsWith('_settings_v1')){delete expected.apiUrl;delete expected.apiKey;delete expected.apiModel;expected.lastTab='settings'}assert.deepEqual(backup.items[key],expected,key+' release SAF preservation')}
 const z=backup.items.wanbanXiaowu_progress_v1.zuma;checks.push({check:'Release normal SAF exports five parsed items unchanged except expected settings navigation/API omission; newer builtin4 is active',snapshotId:backup.content.snapshotId,keys:keys.map(k=>({key:k,beforeSHA256:hash(before[k]||'null')})),zuma:{score:z.score,classicSchema:z.zumaClassic?.schema,level:z.zumaClassic?.levelIndex,lives:z.zumaClassic?.lives},settingsExceptions:['lastTab=settings after export','apiUrl/apiKey/apiModel omitted by normal backup policy']});
 }else{checks.push(...JSON.parse(readFileSync(out+'/release.json')).checks)}
 tap(await find(n=>n.text==='祖玛',true));await sleep(500);tap(await find(n=>n['resource-id']==='wb-progress-continue'));await sleep(1500);tap(await find(n=>n['resource-id']==='wb-zuma-pause'));await sleep(3000);screenshot(out+'/release-zuma-paused.png');
 const gameUI=await nativeNodes();assert(gameUI.some(n=>n.text==='继续冒险'),'New classic view really opened in release');checks.push({check:'Release real continue opens new classic Zuma with pause/continue controls',debugTransportUsed:false});
 adb('shell','input','keyevent','4');await sleep(600);screenshot(out+'/release-home-final.png');
 const rotation={mode:adb('shell','wm','user-rotation').trim(),accelerometer:adb('shell','settings','get','system','accelerometer_rotation').trim(),rotation:adb('shell','settings','get','system','user_rotation').trim()};assert.deepEqual(rotation,{mode:'free',accelerometer:'1',rotation:'0'});checks.push({check:'Original rotation settings remain restored',rotation});
}catch(e){error=String(e).split('\n')[0];writeFileSync(raw+'/failure.txt',String(e.stack||e));process.exitCode=1;try{screenshot(raw+'/failure.png')}catch{}console.error(error)}finally{
 if(c)await c.close();adb('shell','rm','-f','/data/local/tmp/io.github.jacklee992.wanba.compat-geckoview-config.yaml');const forwards=adb('forward','--list');for(const port of ['tcp:2829','tcp:9235'])if(forwards.split('\n').some(line=>line.startsWith(process.env.ADB_SERIAL+' '+port+' ')))adb('forward','--remove',port);
 try{adb('shell','test','!','-e','/data/local/tmp/io.github.jacklee992.wanba.compat-geckoview-config.yaml')}catch(e){error=error||'App-specific debug yaml was not removed';process.exitCode=1;}
 writeFileSync(out+'/release.json',JSON.stringify({passed:!error,checks,error,testedAt:new Date().toISOString(),debugCleanup:'app-specific yaml removed; only this QA forwards2829/9235 removed'},null,2));
}
