// Capture the currently installed RELEASE app through its normal SAF export.
// No install, debug configuration, storage clearing or game fixture injection.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {adb,activity,screenshot,serial} from './android-gecko.mjs';
import {nativeNodes} from './android-native-select.mjs';
if(process.env.WANBA_ENGINE!=='compat'||!process.env.ADB_SERIAL)throw Error('Explicit physical compat target required');
const raw=process.env.QA_PRIVATE||'.local/qa-zuma-classic-v2/baseline';mkdirSync(raw,{recursive:true});
const out=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/baseline';mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const visible=n=>n?.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1];
function tap(n){assert(visible(n),'Visible native target');const[x,y,r,b]=n.rect;adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1));}
async function find(predicate,scroll=false){for(let i=0;i<12;i++){const n=(await nativeNodes()).find(n=>visible(n)&&predicate(n));if(n)return n;if(scroll)adb('shell','input','swipe','540','1800','540','650','400');await sleep(250)}throw Error('Native target unavailable');}
const result={serial,testedAt:new Date().toISOString(),passed:false};
try {
 adb('get-state');
 const pkg=adb('shell','dumpsys','package','io.github.jacklee992.wanba.compat');
 result.package=pkg.split('\n').filter(s=>/versionCode=|versionName=|flags=\[/.test(s)).map(s=>s.trim());
 adb('shell','am','start','--activity-reorder-to-front','-n',activity);await sleep(1200);
 for(let i=0;i<5;i++){const n=(await nativeNodes()).find(n=>n.text==='设置'&&n.class==='android.widget.Button'&&visible(n));if(n){tap(n);break;}adb('shell','input','keyevent','4');await sleep(300);}
 await sleep(300);tap(await find(n=>n['resource-id']==='wb-export-data',true));await sleep(500);
 let nodes=await nativeNodes();tap(nodes.find(n=>n.class==='android.widget.EditText'));adb('shell','input','keycombination','113','29');
 const wanted='wanba-zuma-baseline-'+Date.now()+'.json';adb('shell','input','text',wanted);nodes=await nativeNodes();const filename=nodes.find(n=>n.class==='android.widget.EditText')?.text;assert(filename?.endsWith(wanted));
 tap(nodes.find(n=>/^(保存|Save|SAVE)$/.test(n.text)&&n.enabled==='true'));await sleep(1000);
 const backupText=adb('shell','cat','/sdcard/Download/'+filename),backup=JSON.parse(backupText);assert.equal(backup.app,'玩吧');
 writeFileSync(raw+'/saf-backup.json',backupText);const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1');
 for(const k of keys)assert(k in backup.items,'Backup includes '+k);
 const storage=Object.fromEntries(keys.map(k=>[k,backup.items[k]]));writeFileSync(raw+'/five-items.json',JSON.stringify(storage,null,2));
 const zuma=storage.wanbanXiaowu_progress_v1?.zuma??null;writeFileSync(raw+'/zuma.json',JSON.stringify(zuma,null,2));
 result.content=backup.content?.snapshotId;result.zumaPresent=zuma!==null;result.items=keys.map(k=>({key:k,sha256:createHash('sha256').update(JSON.stringify(storage[k])).digest('hex')}));
 result.note='Normal release SAF export: five parsed JSON items captured privately; settings API fields are intentionally omitted. This is not a claim of raw localStorage byte equality.';
 tap(await find(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button'));await sleep(350);screenshot(out+'/baseline-home.png');
 result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(error){result.error=String(error);process.exitCode=1;try{screenshot(raw+'/failure.png')}catch{}console.error(error)}
finally{writeFileSync(out+'/baseline.json',JSON.stringify(result,null,2));}
