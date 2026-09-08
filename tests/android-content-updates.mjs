// End-to-end against the fixed real GitHub release channel and the installed APK.
// Requires an already-running debug app; never installs, clears data or injects game fixtures.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,adb,screenshot,activity,origin} from './android-driver.mjs';
const out=process.env.QA_OUT||'docs/evidence/android-1.2/content-updates';mkdirSync(out,{recursive:true});
const expectedId=process.env.EXPECT_SNAPSHOT||'ee361cb03fe2e87f860dbe5977a6a74b312a29879efd5ca4b11ac5e6b593bd9c';
const expectedBytes=Number(process.env.EXPECT_DOWNLOAD_BYTES||4865),expectedPack=process.env.EXPECT_PACK||'game.wordguess';
const expectedPacks=(process.env.EXPECT_PACKS||expectedPack).split(',').sort();
const storageExpr='Object.fromEntries(["settings","scores","progress","records","sudokuState"].map(n=>"wanbanXiaowu_"+n+"_v1").map(k=>[k,localStorage.getItem(k)]))';
const digest=value=>createHash('sha256').update(value===null?'null':value).digest('hex');
const storageHashes=storage=>Object.fromEntries(Object.entries(storage).map(([k,v])=>[k,{bytes:v===null?0:Buffer.byteLength(v),sha256:digest(v)}]));
const packageId=activity.split('/')[0],checks=[];let c=await connect(),network;
const content=()=>c.evaluate('(async()=>JSON.parse(await NativeBridge.getContentState()))()');
const waitFor=async(fn,label,ms=120000)=>{const start=Date.now();let last;while(Date.now()-start<ms){try{last=await fn();if(last)return last}catch(error){last=String(error)}await c.wait(200)}throw Error('Timed out '+label+'; last='+JSON.stringify(last))};
const tapExpression=async expression=>{await c.evaluate(`(${expression}).scrollIntoView({block:'center'})`);await c.wait(240);const p=await c.evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.wait(70);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})};
const tap=selector=>tapExpression(`document.querySelector(${JSON.stringify(selector)})`);
const ready=async id=>waitFor(async()=>{const s=await content();return s.activeSnapshotId===id&&s.bootHealthy&&await c.evaluate('!!window.wanbaApp')?s:false},'healthy snapshot '+id);
const home=async()=>{for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab="single"]');await c.until('!!document.querySelector("#wanba-check-games")')};
try {
 await home();const before=await content(),beforeStorage=await c.evaluate(storageExpr);assert.notEqual(before.activeSnapshotId,expectedId,'start from the prior content snapshot');
 await tap('#wanba-check-games');
 const available=await waitFor(async()=>{const s=await content();if(s.job?.state==='error')throw Error(s.job.message);return s.candidate?.snapshotId===expectedId?s:false},'signed content candidate');
 const changed=available.candidate.packages.filter(p=>before.active.packages.find(old=>old.id===p.id)?.sha256!==p.sha256);
 assert.deepEqual(changed.map(p=>p.id).sort(),expectedPacks);assert.equal(changed.reduce((n,p)=>n+p.size,0),expectedBytes);assert.equal(available.candidate.packages.length,Number(process.env.EXPECT_TOTAL_PACKS||81));
 checks.push({check:'real GitHub signed manifest accepted',repository:available.repository,oldId:before.activeSnapshotId,newId:expectedId,changed});
 screenshot(`${out}/update-available.png`);
 await tap('#wanba-install-games');
 const downloaded=await waitFor(async()=>{const s=await content();return s.candidateReady&&s.job?.state==='ready'?s:false},'changed package download');
 assert.equal(downloaded.job.totalBytes,expectedBytes);assert.equal(downloaded.job.downloadedBytes,expectedBytes);assert.equal(downloaded.activeSnapshotId,before.activeSnapshotId);assert.deepEqual(await c.evaluate(storageExpr),beforeStorage);
 checks.push({check:'only the changed package downloaded; prior active snapshot and all five storage keys unchanged',job:downloaded.job});screenshot(`${out}/update-downloaded.png`);
 await tap('#wanba-install-games');const activated=await ready(expectedId);
 const afterStorage=await c.evaluate(storageExpr);assert.deepEqual(afterStorage,beforeStorage);
 assert.equal(await c.evaluate('location.href'),origin+`/assets/updates/${expectedId}/www/standalone/index.html`);
 for(const p of before.active.packages.filter(p=>!expectedPacks.includes(p.id)))assert.deepEqual(activated.active.packages.find(n=>n.id===p.id),p);
 checks.push({check:'immutable snapshot atomically activated and marked healthy; unchanged package records and exact raw checkpoint retained',unchangedPackages:before.active.packages.length-changed.length,bootHealthy:activated.bootHealthy,storage:storageHashes(afterStorage)});screenshot(`${out}/update-activated.png`);
 if(process.env.QA_ACTIVATE_ONLY!=='1') {
 const mode=await c.evaluate('wanbaApp.inspect().games.find(g=>g.id==="wordguess").mode');await c.click(`[data-tab="${mode}"]`);await tap('[data-game="wordguess"]');await c.wait(220);
 if(await c.evaluate('!!document.querySelector("#wb-progress-continue")'))await tap('#wb-progress-continue');else await tap('#wb-start-cover-btn');
 await c.until('!!document.querySelector("#wb-word-submit")');await c.until('!wanbaApp.inspect().paused');
 const wordVersion=await c.evaluate('wanbaApp.inspect().games.find(g=>g.id==="wordguess").content.gameVersion');assert.equal(wordVersion,'1.0.1');assert.ok(await c.evaluate('!!document.querySelector("[data-word-stat=question]")'));
 const beforePlay=await c.evaluate(storageExpr),guess='QA-'+Date.now();await c.evaluate(`document.querySelector('#wb-word-input').value=${JSON.stringify(guess)}`);await tap('#wb-word-submit');
 await c.until(`document.querySelector('#wb-word-history').innerText.includes(${JSON.stringify(guess)})`);await home();await c.evaluate('wanbaApp.pause();wanbaApp.save()');
 // Model closing an Android app normally before its process is reclaimed. A
 // force-stop immediately after a DOM storage write skips Activity.onPause and
 // tests browser crash durability instead of offline lifecycle persistence.
 adb('shell','input','keyevent','3');await c.wait(10000);
 const playedStorage=await c.evaluate(storageExpr);assert.notEqual(playedStorage.wanbanXiaowu_progress_v1,beforePlay.wanbanXiaowu_progress_v1);
 checks.push({check:'updated wordguess 1.0.1 plugin rendered its new labeled UI and a real submitted guess persisted',storage:storageHashes(playedStorage)});
 // Reversible, scoped offline QA: preserve both pre-test radio states, including failures.
 network={wifi:adb('shell','settings','get','global','wifi_on').trim(),data:adb('shell','settings','get','global','mobile_data').trim()};
 await c.close();c=null;adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');
 adb('shell','am','force-stop',packageId);adb('shell','am','start','--activity-reorder-to-front','-n',activity);c=await connect();
 const offline=await ready(expectedId);assert.deepEqual(await c.evaluate(storageExpr),playedStorage);
 checks.push({check:'Wi-Fi and mobile data disabled: cold process launch remains healthy on the downloaded immutable snapshot with exact saved data',bootHealthy:offline.bootHealthy,radiosDuring:{wifi:adb('shell','settings','get','global','wifi_on').trim(),data:adb('shell','settings','get','global','mobile_data').trim()}});screenshot(`${out}/update-offline-cold-start.png`);
 if(network.wifi==='1'||network.wifi==='2')adb('shell','svc','wifi','enable');if(network.data==='1')adb('shell','svc','data','enable');network=null;
 await home();await tapExpression('[...document.querySelectorAll(".wanba-updates button")].find(b=>b.textContent==="回退内容版本")');
 const confirm='[...document.querySelectorAll(".wanba-update-confirm button")].find(b=>b.textContent==="确认回退")';
 if(process.env.QA_ALLOW_LEGACY_ROLLBACK_CLICK==='1'){
  checks.push({check:'LEGACY UI WORKAROUND: old core detaches rollback confirmation on touchend; native rollback is tested with DOM click',realTouchRollbackPassed:false});
  await c.evaluate(`(${confirm}).click()`).catch(error=>{if(!/unloaded|context.*destroyed/i.test(String(error)))throw error});
 }else await tapExpression(confirm);
 const rollback=await ready(before.activeSnapshotId);assert.deepEqual(await c.evaluate(storageExpr),playedStorage);
 checks.push({check:'healthy manual rollback retains actual post-update gameplay progress rather than restoring the old checkpoint',activeSnapshotId:rollback.activeSnapshotId,storage:storageHashes(playedStorage)});screenshot(`${out}/update-rollback.png`);
 }
 console.log(JSON.stringify({passed:true,activationOnly:process.env.QA_ACTIVATE_ONLY==='1',checks},null,2));
}catch(error){if(c)screenshot(`${out}/update-failure.png`);console.error({message:error.message,stack:error.stack});process.exitCode=1}
finally {
 if(network){if(network.wifi==='1'||network.wifi==='2')adb('shell','svc','wifi','enable');if(network.data==='1')adb('shell','svc','data','enable')}
 writeFileSync(`${out}/content-update-regression.json`,JSON.stringify({passed:process.exitCode!==1,activationOnly:process.env.QA_ACTIVATE_ONLY==='1',testedAt:new Date().toISOString(),checks},null,2));if(c)await c.close();
}
