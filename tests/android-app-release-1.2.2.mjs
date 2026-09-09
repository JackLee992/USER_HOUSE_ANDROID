// Native-only release QA on an explicitly assigned physical HONOR device.
// App data is inspected only through its normal SAF export. Public evidence
// contains hashes and selected game facts; complete exports stay under .local.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const serial=process.env.ADB_SERIAL;
assert(serial&&!serial.startsWith('emulator-'),'Explicit physical ADB_SERIAL required');
const adbBin=process.env.ADB||'/Users/jacklee/Library/Android/sdk/platform-tools/adb';
const pkg='io.github.jacklee992.wanba.compat';
const activity=pkg+'/io.github.jacklee992.wanba.CompatActivity';
const updater=pkg+'/io.github.jacklee992.wanba.appupdater.AppUpdateActivity';
const apk='.local/releases/v1.2.2/wanba-compat-1.2.2.apk';
const expectedHash='23ebea8f4382a5c356770423020dff19414afe4d307b5f5bc875cab7e1f94bdd';
const expectedSnapshot='60dd78b5b5006de9e0488dba2848e60572346f473512e3de8f1354b543c8161c';
const phase=process.env.QA_PHASE||'baseline';
assert(['baseline','upgrade','game','updater'].includes(phase),'Known explicit QA_PHASE');
const raw=path.resolve(process.env.QA_PRIVATE||'.local/qa-app-release-1.2.2/phone');
assert(raw.startsWith(path.resolve('.local')+path.sep),'Private exports must remain in .local');
const out=process.env.QA_OUT||'docs/evidence/android-1.2.2/phone';
mkdirSync(raw,{recursive:true});mkdirSync(out,{recursive:true});
const reportFile=out+'/result.json';
const report=existsSync(reportFile)?JSON.parse(readFileSync(reportFile)):{device:'HONOR physical',serialRedacted:true,phases:{}};
const hash=v=>createHash('sha256').update(v).digest('hex');
const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function adb(...args){return execFileSync(adbBin,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000});}
function screenshot(file){writeFileSync(file,execFileSync(adbBin,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));}
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
async function nodes(){
 const remote='/data/local/tmp/wanba-release-'+process.pid+'.xml';
 try{adb('shell','uiautomator','dump','--compressed',remote);const xml=adb('exec-out','cat',remote);
 return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>{const n=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])]));const r=n.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);n.rect=r?r.slice(1).map(Number):null;return n;});
 }finally{adb('shell','rm','-f',remote);}
}
const visible=n=>n?.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1];
async function tap(n){assert(visible(n)&&n.enabled!=='false','Visible enabled native target');const[x,y,r,b]=n.rect;adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1));await sleep(300);}
async function find(test,scroll=false,attempts=12){
 for(let i=0;i<attempts;i++){const n=(await nodes()).find(n=>visible(n)&&test(n));if(n)return n;
 if(scroll){const size=adb('shell','wm','size').match(/(\d+)x(\d+)/);assert(size);const w=Number(size[1]),h=Number(size[2]);adb('shell','input','swipe',String(w>>1),String(Math.round(h*.79)),String(w>>1),String(Math.round(h*.3)),'400');}
 await sleep(250);}throw Error('Expected native control unavailable');
}
async function openSettings(){
 adb('shell','am','start','--activity-reorder-to-front','-n',activity);await sleep(1200);
 for(let i=0;i<7;i++){const n=(await nodes()).find(n=>visible(n)&&n.text==='设置'&&n.class==='android.widget.Button');if(n){await tap(n);return;}adb('shell','input','keyevent','4');await sleep(400);}throw Error('Settings navigation unavailable');
}
async function exportSaf(name){
 assert(!existsSync(raw+'/'+name+'.json'),'Never overwrite a captured SAF backup');
 await openSettings();await tap(await find(n=>n['resource-id']==='wb-export-data',true));await sleep(500);
 await tap(await find(n=>n.class==='android.widget.EditText'));
 adb('shell','input','keycombination','113','29');
 const wanted='wanba-release-122-'+name+'-'+Date.now()+'.json';adb('shell','input','text',wanted);
 let all=await nodes();const filename=all.find(n=>n.class==='android.widget.EditText')?.text;
 assert(filename?.endsWith(wanted)&&!/[\/\r\n]/.test(filename),'Actual normal SAF filename');
 await tap(all.find(n=>/^(保存|Save|SAVE)$/.test(n.text)&&n.enabled==='true'));await sleep(1000);
 const text=adb('shell','cat','/sdcard/Download/'+filename),backup=JSON.parse(text);assert.equal(backup.app,'玩吧');
 for(const key of keys)assert(key in backup.items,'SAF includes '+key);
 writeFileSync(raw+'/'+name+'.json',text);
 return backup;
}
function packageInfo(code,name){
 const info=adb('shell','dumpsys','package',pkg);
 assert(new RegExp('versionCode='+code+'\\b').test(info),'Expected installed version code');
 assert(info.includes('versionName='+name+'\n'),'Expected installed version name');
 assert(!/flags=\[[^\]]*\bDEBUGGABLE\b/.test(info),'Release is nondebuggable');
 return{versionCode:code,versionName:name,debuggable:false,signatureScheme:Number(info.match(/apkSigningVersion=(\d+)/)?.[1])};
}
function installedHash(){const apkPath=adb('shell','pm','path',pkg).trim().replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_~=+./-]+\/base\.apk$/.test(apkPath));const value=adb('shell','sha256sum',apkPath).trim().split(/\s+/)[0];assert.equal(value,expectedHash,'Installed exact signed artifact');return value;}
function itemHashes(backup){return keys.map(key=>({key,sha256:hash(JSON.stringify(backup.items[key]))}));}
function rotation(){return{mode:adb('shell','wm','user-rotation').trim(),accelerometer:adb('shell','settings','get','system','accelerometer_rotation').trim(),rotation:adb('shell','settings','get','system','user_rotation').trim()};}
async function game(){
 await openSettings();await tap(await find(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button'));
 await tap(await find(n=>n.text==='祖玛',true));await tap(await find(n=>n['resource-id']==='wb-progress-continue'));
 await sleep(1200);const pause=await find(n=>n['resource-id']==='wb-zuma-pause');
 screenshot(out+'/zuma-running-fullscreen.png');await tap(pause);await sleep(1000);
 assert((await nodes()).some(n=>n.text==='继续冒险'),'Real continued game reaches pause menu');
 screenshot(out+'/zuma-paused.png');
 adb('shell','input','keyevent','4');await sleep(500);
 await openSettings();await tap(await find(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button'));screenshot(out+'/home-final.png');
 return{realNativeContinueAndPause:true,pausedText:'继续冒险',screenshots:['zuma-running-fullscreen.png','zuma-paused.png','home-final.png']};
}
let failure=null;
try{
 assert.equal(adb('get-state').trim(),'device');assert(/honor/i.test(adb('shell','getprop','ro.product.manufacturer')),'Assigned physical HONOR manufacturer');
 assert.notEqual(adb('shell','getprop','ro.kernel.qemu').trim(),'1','Physical device only');
 report.deviceModel=adb('shell','getprop','ro.product.model').trim();
 report.rotationBefore=rotation();
 if(phase==='baseline'){
  const installed=packageInfo(4,'1.2.1');const backup=await exportSaf('before');const z=backup.items.wanbanXiaowu_progress_v1.zuma;
  assert.equal(z.score,4760);assert.equal(z.zumaClassic.levelIndex,1);assert.equal(z.zumaClassic.lives,1);
  report.phases.baseline={passed:true,installed,snapshotId:backup.content?.snapshotId,items:itemHashes(backup),zuma:{score:z.score,levelIndex:z.zumaClassic.levelIndex,lives:z.zumaClassic.lives},normalSaf:true};
  await tap(await find(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button'));screenshot(out+'/before-home.png');
 }else if(phase==='upgrade'){
  assert(report.phases.baseline?.passed,'Successful preinstall SAF baseline required');
  const before=JSON.parse(readFileSync(raw+'/before.json'));assert.equal(hash(readFileSync(apk)),expectedHash,'Frozen release SHA256');
  if(!existsSync(raw+'/install.txt')){packageInfo(4,'1.2.1');const install=adb('install','-r',apk);assert(/Success/.test(install));writeFileSync(raw+'/install.txt',install);}
  const installed=packageInfo(6,'1.2.2');installed.sha256=installedHash();
  const after=existsSync(raw+'/after.json')?JSON.parse(readFileSync(raw+'/after.json')):await exportSaf('after');
  for(const key of keys)assert.deepEqual(after.items[key],before.items[key],'Unchanged parsed SAF item '+key);
  assert.equal(after.content?.snapshotId,expectedSnapshot,'Builtin content5 active');
  report.phases.upgrade={passed:true,installed,allFiveParsedItemsEqual:true,items:itemHashes(after),snapshotId:after.content.snapshotId,normalSaf:true,installation:'adb install -r exact frozen artifact; not an in-app delta claim'};
  writeFileSync(reportFile,JSON.stringify(report,null,2));
  report.phases.game={passed:true,...await game()};
 }else if(phase==='game'){
  packageInfo(6,'1.2.2');assert(report.phases.upgrade?.passed);report.phases.game={passed:true,...await game()};
 }else{
  packageInfo(6,'1.2.2');assert(report.phases.upgrade?.passed);
  await openSettings();await tap(await find(n=>n['resource-id']==='wanba-app-update',true));
  const foreground=adb('shell','dumpsys','activity','activities');assert(foreground.includes(updater),'Native updater Activity launched from real About control');
  screenshot(out+'/app-updater-entry.png');await tap(await find(n=>/^检查 app 更新$/i.test(n.text)&&n.class==='android.widget.Button'));
  const current=await find(n=>n.text.includes('App 已是最新版本'),false,30);assert(visible(current));screenshot(out+'/app-updater-current.png');
  await tap(await find(n=>n.text==='返回'&&n.class==='android.widget.Button'));
  await openSettings();await tap(await find(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button'));screenshot(out+'/home-final.png');
  report.phases.updater={passed:true,launchedViaAbout:true,nativeActivity:updater,publicChannelCheck:'App 已是最新版本',installed:packageInfo(6,'1.2.2'),installedSHA256:installedHash()};
 }
}catch(error){failure=String(error).replaceAll(serial,'[physical device]');writeFileSync(raw+'/failure-'+phase+'.txt',String(error.stack||error));process.exitCode=1;try{screenshot(raw+'/failure-'+phase+'.png')}catch{}console.error(failure);}
finally{
 try{adb('shell','wm','user-rotation','free');adb('shell','settings','put','system','accelerometer_rotation','1');adb('shell','settings','put','system','user_rotation','0');report.rotationRestored=rotation();assert.deepEqual(report.rotationRestored,{mode:'free',accelerometer:'1',rotation:'0'});}catch(error){failure=failure||'Rotation restoration failed';process.exitCode=1;}
 report.lastRun={phase,passed:!failure,error:failure,testedAt:new Date().toISOString()};
 report.passed=['baseline','upgrade','game','updater'].every(k=>report.phases[k]?.passed)&&!failure;
 report.evidenceBoundary='Only native Android input and normal SAF exports; five parsed items compared before gameplay. Private raw exports retained under .local. No silent installer or debug transport used.';
 writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({phase,passed:!failure,allPhasesPassed:report.passed,phases:report.phases,rotationRestored:report.rotationRestored},null,2));
}
