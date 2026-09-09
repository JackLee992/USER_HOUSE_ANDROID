// Native UI + normal SAF only. Run after the explicit emulator handoff.
// No CDP, WebDriver, run-as, adb install, game hooks, or private app-file reads.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
const serial=process.env.ADB_SERIAL;
if(serial!=='emulator-5554')throw Error('This handoff is scoped to explicit ADB_SERIAL=emulator-5554');
const adbPath=process.env.ADB||'/Users/jacklee/Library/Android/sdk/platform-tools/adb';
const pkg='io.github.jacklee992.wanba',activity=pkg+'/.MainActivity';
const out=process.env.QA_OUT||'docs/evidence/app-delta-1.2.2',raw=process.env.QA_PRIVATE||'.local/qa-app-delta-1.2.2';
mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const manifestPath=process.env.APP_UPDATE_MANIFEST||'.local/releases/v1.2.2/app-updates.json';
const envelope=JSON.parse(readFileSync(manifestPath)),payload=Buffer.from(envelope.payload,'base64');
const key=createPublicKey({key:readFileSync('android/app-updater/src/main/assets/app-updater/public-key.der'),format:'der',type:'spki'});
assert.equal(envelope.schema,1);assert(verify('SHA256',payload,key,Buffer.from(envelope.signature,'base64')),'Local copy of published manifest has the production signature');
const manifest=JSON.parse(payload);assert.equal(manifest.kind,'wanba-apk-update');assert.equal(manifest.repository,'JackLee992/USER_HOUSE_ANDROID');
const entry=manifest.apps.find(e=>e.packageName===pkg);assert(entry);assert.equal(entry.versionCode,Number(process.env.TARGET_VERSION_CODE||6));assert.equal(entry.versionName,'1.2.2');
const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1');
const checks=[],statuses=[],remoteXML='/data/local/tmp/wanba-apk-delta-'+process.pid+'.xml';let failed=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(v).digest('hex');
const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:30000});
const screenshot=name=>writeFileSync(out+'/'+name+'.png',execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024,timeout:15000}));
const decode=s=>s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,(_,h,d,n)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(Number(d)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[n.toLowerCase()]);
function nodes(){
 try{adb('shell','uiautomator','dump','--compressed',remoteXML)}catch(error){adb('shell','uiautomator','dump','--compressed',remoteXML)}const xml=adb('exec-out','cat',remoteXML);assert(xml.includes('<hierarchy'),'Native accessibility hierarchy available');
 writeFileSync(raw+'/last-ui.xml',xml);
 return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(([,s])=>{const a=Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)]));a.rect=(a.bounds||'').match(/\d+/g)?.map(Number);return a});
}
const text=n=>(n.text||n['content-desc']||'').replace(/\s+/g,' ').trim();
const visible=n=>n?.rect?.length===4&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1];
function tap(n){assert(visible(n)&&n.enabled!=='false','Visible enabled native control');const[x,y,r,b]=n.rect;adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1));}
let size;
function swipe(direction){if(!size){const matches=[...adb('shell','wm','size').matchAll(/(\d+)x(\d+)/g)];assert(matches.length);size=matches.at(-1).slice(1).map(Number)}const[w,h]=size;adb('shell','input','swipe',String(Math.round(w*.5)),String(Math.round(h*(direction==='down'?.79:.34))),String(Math.round(w*.5)),String(Math.round(h*(direction==='down'?.34:.79))),'400');}
async function find(predicate,label,{scroll=false,timeout=25000}={}){const deadline=Date.now()+timeout;while(Date.now()<deadline){const n=nodes().find(n=>visible(n)&&predicate(n));if(n)return n;if(scroll)swipe('down');await wait(250)}throw Error('Native control unavailable: '+label)}
const button=label=>find(n=>n.class==='android.widget.Button'&&text(n).toLowerCase()===label.toLowerCase()&&n.enabled==='true',label);
function persist(){writeFileSync(raw+'/run-state.json',JSON.stringify({checks,statuses},null,2));}
function installed(){const p=adb('shell','dumpsys','package',pkg),versionCode=Number(/versionCode=(\d+)/.exec(p)?.[1]),versionName=/versionName=([^\s]+)/.exec(p)?.[1];assert(!/flags=\[[^\]]*\bDEBUGGABLE\b/.test(p),'Installed application is non-debuggable');const paths=adb('shell','pm','path',pkg).trim().split('\n');assert.equal(paths.length,1,'Monolithic APK installation');const path=paths[0].replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_~=+./-]+\/base\.apk$/.test(path));return{versionCode,versionName,sha256:adb('shell','sha256sum',path).split(/\s+/)[0]};}
async function openSettings(){
 adb('shell','am','start','--activity-reorder-to-front','-n',activity);await wait(1200);
 for(let i=0;i<5;i++){const n=nodes().find(n=>visible(n)&&n.class==='android.widget.Button'&&/^(设置|Settings)$/i.test(text(n)));if(n){tap(n);await wait(350);return}adb('shell','input','keyevent','4');await wait(300)}throw Error('Native settings tab missing');
}
async function exportBackup(stage){
 await openSettings();for(let i=0;i<3;i++)swipe('up');
 tap(await find(n=>n['resource-id']==='wb-export-data'||n.class==='android.widget.Button'&&text(n)==='导出备份','normal data export',{scroll:true}));await wait(450);
 tap(await find(n=>n.class==='android.widget.EditText','SAF filename'));adb('shell','input','keycombination','113','29');const wanted='wanba-apk-delta-'+stage+'-'+Date.now()+'.json';adb('shell','input','text',wanted);
 const filename=text(await find(n=>n.class==='android.widget.EditText','typed SAF filename'));assert(filename.endsWith(wanted)&&/^[A-Za-z0-9._-]+$/.test(filename));
 tap(await find(n=>n.class==='android.widget.Button'&&/^(SAVE|保存)$/i.test(text(n))&&n.enabled==='true','OS SAF SAVE'));await wait(1000);
 const backupText=adb('shell','cat','/sdcard/Download/'+filename),backup=JSON.parse(backupText);assert.equal(backup.app,'玩吧');for(const k of keys)assert(k in backup.items,'SAF item '+k);writeFileSync(raw+'/'+stage+'-backup.json',backupText);return backup;
}
function updaterStatus(list){return list.filter(n=>n.package===pkg&&n.class==='android.widget.TextView').map(text).filter(t=>t&&t!=='App 更新').join('\n');}
function rememberStatus(status){if(status&&statuses.at(-1)?.text!==status){statuses.push({at:new Date().toISOString(),text:status});console.log(status);persist();}}
async function installThroughOS(){
 const initial=nodes();if(!initial.some(n=>/^(?:com\.(?:google\.)?android\.(?:settings|packageinstaller|permissioncontroller))$/.test(n.package||'')))tap(await button('安装已验证 APK'));let unknownGranted=false,osConfirmed=false;
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  const list=nodes();const status=updaterStatus(list);rememberStatus(status);
  const settings=list.some(n=>/^(?:com\.android\.settings|com\.google\.android\.settings)$/.test(n.package||''));
  if(settings&&list.some(n=>/Allow from this source|允许来自此来源|允许安装应用|允许安装未知应用/i.test(text(n)))){
   assert(list.some(n=>/^(玩吧|Nookcade|ヌックケード|눅케이드)$/.test(text(n))),'Unknown-source consent names the production localized application');
   const toggles=list.filter(n=>visible(n)&&(/Switch/.test(n.class||'')||n.checkable==='true')&&n.enabled==='true');assert.equal(toggles.length,1,'One app-specific installation switch');const toggle=toggles[0];
   if(toggle.checked!=='true'){tap(toggle);unknownGranted=true;await wait(300)}screenshot('os-source-permission');adb('shell','input','keyevent','4');await wait(450);tap(await button('安装已验证 APK'));continue;
  }
  const confirm=list.find(n=>visible(n)&&/^(?:com\.(?:google\.)?android\.(?:packageinstaller|permissioncontroller))$/.test(n.package||'')&&n.class==='android.widget.Button'&&/^(INSTALL|UPDATE|安装|更新)$/i.test(text(n))&&n.enabled==='true');
  if(confirm){screenshot('os-install-confirm');tap(confirm);osConfirmed=true;checks.push({check:'Android installer required and received explicit native confirmation',button:text(confirm),appSpecificUnknownSourceEnabled:unknownGranted});persist();break}
  if(/失败|失败重试|not allowed|denied/i.test(status))throw Error('Native installation error: '+status);await wait(300);
 }
 assert(osConfirmed,'Real OS installation confirmation was observed');
 const end=Date.now()+90000;while(Date.now()<end){const info=installed();if(info.versionCode===entry.versionCode)return info;await wait(700)}throw Error('OS did not replace package with target version');
}
try{
 let before,delta;
 if(process.env.QA_RESUME_AFTER_INSTALL==='1'){
  const prior=JSON.parse(readFileSync(raw+'/run-state.json'));checks.push(...prior.checks);statuses.push(...prior.statuses);before=JSON.parse(readFileSync(raw+'/before-backup.json'));delta=JSON.parse(readFileSync(raw+'/selected-delta.json'));
 }else if(process.env.QA_RESUME_INSTALL==='1'){
  const prior=JSON.parse(readFileSync(raw+'/run-state.json'));checks.push(...prior.checks);statuses.push(...prior.statuses);before=JSON.parse(readFileSync(raw+'/before-backup.json'));delta=JSON.parse(readFileSync(raw+'/selected-delta.json'));await installThroughOS();
 }else{
  if(process.env.QA_RESUME_AFTER_BASELINE==='1'){
   const prior=JSON.parse(readFileSync(raw+'/run-state.json'));checks.push(...prior.checks);statuses.push(...prior.statuses);before=JSON.parse(readFileSync(raw+'/before-backup.json'));delta=JSON.parse(readFileSync(raw+'/selected-delta.json'));const base=installed();assert.equal(base.versionCode,delta.baseVersionCode);assert.equal(base.sha256,delta.baseSha256);
  }else{
  const base=installed();assert.equal(base.versionCode,Number(process.env.FROM_VERSION_CODE||5),'Internal non-debug RC is the installed base');delta=entry.deltas.find(d=>d.baseVersionCode===base.versionCode&&d.baseSha256===base.sha256);assert(delta,'Signed channel includes a delta for this exact installed base APK');assert(delta.size<entry.full.size);writeFileSync(raw+'/selected-delta.json',JSON.stringify(delta,null,2));
  checks.push({check:'Exact non-debug RC APK matches the signed delta base',base,manifestSequence:manifest.sequence,manifestPayloadSHA256:sha(payload),deltaBytes:delta.size,fullBytes:entry.full.size});persist();
  before=await exportBackup('before');checks.push({check:'Normal RC SAF captured all five parsed data items privately before update',items:keys.map(k=>({key:k,sha256:sha(JSON.stringify(before.items[k]))})),progressGames:Object.keys(before.items.wanbanXiaowu_progress_v1||{}).length});persist();
  }
  // Settings is still selected after SAF. Scroll down to the real web entry.
  if(!nodes().some(n=>n.class==='android.widget.Button'&&text(n).toLowerCase()==='检查 app 更新'))tap(await find(n=>n['resource-id']==='wanba-app-update'||n.class==='android.widget.Button'&&text(n)==='检查更新','App updater entry',{scroll:true}));await button('检查 App 更新');await wait(500);screenshot('native-updater-entry');
  if(process.env.QA_BASELINE_ONLY==='1'){checks.push({check:'RC baseline and native entry prepared; public check not requested yet'});persist();console.log('BASELINE_READY: no public update check performed');}else{
  tap(await button('检查 App 更新'));
  await find(n=>n.class==='android.widget.Button'&&text(n)==='下载更新'&&n.enabled==='true','signed update available',{timeout:90000});rememberStatus(updaterStatus(nodes()));screenshot('native-update-available');tap(await button('下载更新'));
  const deadline=Date.now()+300000;let ready=false,sawDelta=false,sawFull=false,readyText='';
  while(Date.now()<deadline){const list=nodes(),status=updaterStatus(list);rememberStatus(status);
   if(/下载增量包|增量下载成功|本次.{0,12}增量|已(?:使用|通过)增量/.test(status)){if(!sawDelta)screenshot('native-delta-download');sawDelta=true}
   if(/下载完整 APK|改为下载完整|完整包下载成功/.test(status))sawFull=true;
   if(list.some(n=>n.class==='android.widget.Button'&&text(n)==='安装已验证 APK'&&n.enabled==='true')){ready=true;readyText=status;screenshot('native-verified-apk');break}
   if(list.some(n=>n.class==='android.widget.Button'&&text(n).toLowerCase()==='检查 app 更新'&&n.enabled==='true')&&!/发现 App/.test(status))throw Error('Download did not complete: '+status);await wait(300);
  }
  assert(ready,'Verified complete APK becomes installable');assert(sawDelta,'Actual native status confirms delta path');assert(!sawFull,'No full-APK fallback was observed');
  const summary=/增量下载成功[：:]\s*(\d+)\s*字节（完整 APK\s*(\d+)\s*字节/.exec(readyText);
  assert(summary,'Stable production completion text confirms actual delta success and exact byte counts');
  assert.equal(Number(summary[1]),delta.size,'Native downloaded delta response-body bytes match signed manifest');assert.equal(Number(summary[2]),entry.full.size,'Native full APK size matches signed manifest');
  checks.push({check:'Native UI confirms the matching delta response-body byte count and verifies the rebuilt APK before installation',deltaBytes:Number(summary[1]),fullBytes:Number(summary[2]),downloadRatio:delta.size/entry.full.size,bytesOrigin:'Signed manifest and stable production UI summary; excludes HTTP/TLS overhead',readyText});persist();
  await installThroughOS();
  }
 }
 if(process.env.QA_BASELINE_ONLY!=='1'){
 const target=installed();assert.equal(target.versionCode,entry.versionCode);assert.equal(target.versionName,entry.versionName);assert.equal(target.sha256,entry.full.sha256,'Installed APK equals the complete signed release artifact');checks.push({check:'OS installed stable code6; installed full APK hash matches signed release and package remains non-debuggable',target});persist();
 const after=await exportBackup('after');for(const k of keys)assert.deepEqual(after.items[k],before.items[k],k+' parsed SAF data preserved exactly');checks.push({check:'Stable release normal SAF retains all five parsed JSON items exactly',items:keys.map(k=>({key:k,sha256:sha(JSON.stringify(after.items[k]))})),beforeContent:before.content?.snapshotId,afterContent:after.content?.snapshotId});persist();
 tap(await find(n=>n.class==='android.widget.Button'&&/^单人游戏/.test(text(n)),'final catalog'));await wait(350);screenshot('stable-home-final');
 }
}catch(error){failed=String(error).split('\n')[0];writeFileSync(raw+'/failure.txt',String(error.stack||error));process.exitCode=1;try{screenshot('failure')}catch{}console.error(failed)}finally{try{adb('shell','rm','-f',remoteXML)}catch{}writeFileSync(out+'/report.json',JSON.stringify({passed:failed?false:process.env.QA_BASELINE_ONLY==='1'?null:true,stage:process.env.QA_BASELINE_ONLY==='1'?'baseline-prepared':'complete',testedAt:new Date().toISOString(),scope:'emulator native UI + OS installer + normal SAF; no debug interface or adb installation',checks,statuses,error:failed},null,2))}
