import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect,adb,activity,screenshot,serial} from './android-gecko.mjs';
const out=process.env.QA_OUT||'.local/qa-v1.2/compat-phone';mkdirSync(out,{recursive:true});
const apk=resolve(process.argv[2]||'.local/qa-v1.2/content1/compat-debug.apk');
const snapshot='Object.fromEntries(["settings","scores","progress","records","sudokuState"].map(n=>"wanbanXiaowu_"+n+"_v1").map(k=>[k,localStorage.getItem(k)]))';
let c=await connect();
try {
 await c.evaluate('wanbaApp.pause();wanbaApp.save()');await c.wait(350);
 const before=await c.evaluate(snapshot);writeFileSync(`${out}/upgrade-before.json`,JSON.stringify({serial,storage:before,app:await c.evaluate('wanbaApp.inspect().appInfo')},null,2));
 await c.close();c=null;
 const install=adb('install','-r',apk);assert.match(install,/Success/);
 adb('shell','am','start','--activity-reorder-to-front','-n',activity);c=await connect();
 const after=await c.evaluate(snapshot),content=JSON.parse(await c.evaluate('NativeBridge.getContentState()')),app=await c.evaluate('wanbaApp.inspect().appInfo');
 writeFileSync(`${out}/upgrade-after.json`,JSON.stringify({serial,storage:after,app,content},null,2));
 assert.deepEqual(after,before,'same-signature APK upgrade preserves all five raw storage keys');
 assert.equal(app.appVersion,'1.2.0');assert.equal(app.engineVersion,'155.0.1');
 assert.equal(content.bootHealthy,true);assert.equal(content.active.packages.length,81);assert.equal(Object.keys(content.active.games).length,37);
 screenshot(`${out}/content1-first-upgrade.png`);
 console.log(JSON.stringify({passed:true,rawStorageKeysPreserved:5,app,content:{snapshotId:content.activeSnapshotId,version:content.active.snapshotVersion,packs:content.active.packages.length,games:Object.keys(content.active.games).length,bootHealthy:content.bootHealthy}},null,2));
} finally {if(c)await c.close();}
