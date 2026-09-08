// Authorized physical-device handoff: real rollback, same-signature release
// upgrade, then SAF export comparison without any release debugging interface.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,adb,screenshot,activity} from './android-gecko.mjs';
import {touch} from './android-native-select.mjs';
if(!process.env.ADB_SERIAL||process.env.WANBA_ENGINE!=='compat')throw Error('Explicit compat physical-device target required');
const out=process.env.QA_OUT||'docs/evidence/android-1.2/compat-phone/release';
const raw='.local/qa-v1.2/compat-phone/release';mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const expected='8e815134b71ca8e726504aac90629c8f3c37270e99794b2031099b34bcb22fe2';
const previous='ee361cb03fe2e87f860dbe5977a6a74b312a29879efd5ca4b11ac5e6b593bd9c';
const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1');
const expr=`Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`;
const checks=[];let c=await connect(),failure=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=s=>createHash('sha256').update(s||'null').digest('hex');
function nodes(){const p='/data/local/tmp/wanba-release-window.xml';adb('shell','uiautomator','dump','--compressed',p);const xml=adb('shell','cat',p);adb('shell','rm',p);return [...xml.matchAll(/<node\s+([^>]+)/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
const visible=n=>n&&n.bounds?.match(/\d+/g)?.map(Number).some(x=>x>0);
function nativeTap(n){assert(visible(n),'Visible native node required');const [x,y,r,b]=n.bounds.match(/\d+/g).map(Number);assert(r>x&&b>y,'Nonempty native bounds');adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1));}
async function findNode(test,scroll=false){for(let i=0;i<12;i++){const n=nodes().find(n=>test(n)&&visible(n));if(n)return n;if(scroll)adb('shell','input','swipe','540','1800','540','650','400');await sleep(350)}throw Error('Native node not found');}
try {
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab=single]');
 await c.evaluate('wanbaApp.pause();wanbaApp.save()');await c.wait(10000);
 const before=await c.evaluate(expr);writeFileSync(`${raw}/before.json`,JSON.stringify(before));
 const state=await c.evaluate('(async()=>JSON.parse(await NativeBridge.getContentState()))()');assert.equal(state.activeSnapshotId,expected);assert.equal(state.bootHealthy,true);
 await touch(c,'#wanba-rollback-games');await c.until('!!document.querySelector("#wanba-confirm-rollback")');await touch(c,'#wanba-confirm-rollback');
 const deadline=Date.now()+30000;let reverted;
 while(Date.now()<deadline){try{reverted=await c.evaluate('(async()=>JSON.parse(await NativeBridge.getContentState()))()');if(reverted.activeSnapshotId===previous&&reverted.bootHealthy)break}catch{}await c.wait(250)}
 assert.equal(reverted.activeSnapshotId,previous);assert.equal(reverted.bootHealthy,true);assert.deepEqual(await c.evaluate(expr),before);
 checks.push({check:'content3 real touch rollback to complete cached content2; healthy and exact five raw storage strings retained',snapshotId:previous});screenshot(`${out}/rollback-before-release.png`);
 await c.evaluate('wanbaApp.pause();wanbaApp.save()');adb('shell','input','keyevent','3');await c.wait(10000);await c.close();c=null;
 const apk=process.env.RELEASE_APK||'.local/releases/v1.2.0/wanba-compat-1.2.0.apk';
 writeFileSync(`${raw}/install.txt`,adb('install','-r',apk));
 adb('shell','rm','-f','/data/local/tmp/io.github.jacklee992.wanba.compat-geckoview-config.yaml');
 adb('shell','am','start','-n',activity);await sleep(4000);
 const home=nodes();assert(home.some(n=>/单人游戏/.test(n.text)));screenshot(`${out}/release-home.png`);
 // Read-only Android accessibility verifies the release content version. No
 // Marionette session, NativeBridge eval or debug re-install after this point.
 assert(home.some(n=>n.text.includes('1.1.0')),'Newer builtin content3 visible after APK upgrade from active2');
 checks.push({check:'release APK starts on newer builtin content3 after active2; new catalog is visible',debugTransportUsed:false});
 nativeTap(home.find(n=>n.text==='设置'&&n.class==='android.widget.Button'));await sleep(400);
 nativeTap(await findNode(n=>n['resource-id']==='wb-export-data',true));await sleep(500);
 let ui=nodes();const edit=ui.find(n=>n.class==='android.widget.EditText');nativeTap(edit);adb('shell','input','keycombination','113','29');
 const filename='wanba-release-qa-'+Date.now()+'.json';adb('shell','input','text',filename);ui=nodes();const actualName=ui.find(n=>n.class==='android.widget.EditText')?.text;assert(actualName?.endsWith(filename));
 nativeTap(ui.find(n=>/^(保存|Save|SAVE)$/.test(n.text)&&n.enabled==='true'));await sleep(1500);
 const exported=JSON.parse(adb('shell','cat','/sdcard/Download/'+actualName));writeFileSync(`${raw}/exported.json`,JSON.stringify(exported));
 assert.equal(exported.app,'玩吧');assert.equal(exported.content.snapshotId,expected);
 for(const k of keys){const expectedItem=JSON.parse(before[k]||'null');if(k.endsWith('_settings_v1')){delete expectedItem.apiUrl;delete expectedItem.apiKey;delete expectedItem.apiModel;expectedItem.lastTab='settings';}assert.deepEqual(exported.items[k],expectedItem,k+' release SAF data');}
 checks.push({check:'release SAF exports scores/progress/records/sudoku unchanged; settings retain all other values after entering settings, with API fields excluded by backup policy',expectedSettingsChanges:['lastTab=single→settings','apiUrl/apiKey/apiModel excluded from exported JSON'],keys:keys.map(k=>({key:k,beforeRawSHA256:hash(before[k])}))});
 const flags=adb('shell','dumpsys','package','io.github.jacklee992.wanba.compat');assert(!/flags=\[[^\]]*\bDEBUGGABLE\b/.test(flags));
 checks.push({check:'installed release package has no DEBUGGABLE flag; app-specific automation YAML removed'});
 const catalog=await findNode(n=>/^单人游戏/.test(n.text)&&n.class==='android.widget.Button');nativeTap(catalog);await sleep(500);screenshot(`${out}/release-home-final.png`);
 console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){failure=String(error.stack||error);process.exitCode=1;screenshot(`${raw}/failure.png`);console.error(error)}
finally{writeFileSync(`${out}/release-regression.json`,JSON.stringify({passed:!failure,checks,failure,testedAt:new Date().toISOString()},null,2));if(c)await c.close()}
