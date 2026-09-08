import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,screenshot} from './android-gecko.mjs';
const out=process.env.QA_OUT||'docs/evidence/android-1.2/compat-phone';mkdirSync(out,{recursive:true});
const c=await connect();let result;
const state=()=>c.evaluate('(async()=>JSON.parse(await NativeBridge.getContentState()))()');
try {
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');
 await c.click('[data-tab="single"]');await c.until('!!document.querySelector("#wanba-check-games")');
 const before=await state();
 await c.evaluate('document.querySelector("#wanba-check-games").scrollIntoView({block:"center"})');await c.wait(220);
 const point=await c.evaluate('(()=>{const r=document.querySelector("#wanba-check-games").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await c.wait(60);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await c.until(`(async()=>{const s=JSON.parse(await NativeBridge.getContentState());return s.job?.jobId!==${JSON.stringify(before.job?.jobId)}&&['upToDate','available','error'].includes(s.job?.state)})()`,90000);
 const after=await state();assert.notEqual(after.job.jobId,before.job?.jobId);assert.equal(after.job.state,process.env.EXPECT_UPDATE_STATE||'upToDate');assert.equal(after.activeSnapshotId,before.activeSnapshotId);assert.equal(after.bootHealthy,true);
 result={passed:true,checkedAt:new Date().toISOString(),repository:after.repository,activeSnapshotId:after.activeSnapshotId,activeVersion:after.active.snapshotVersion,candidate:after.candidate?.snapshotId||null,job:after.job,url:await c.evaluate('location.href')};
 screenshot(`${out}/content-check-device.png`);console.log(JSON.stringify(result,null,2));
} catch(error){result={passed:false,error:String(error)};screenshot(`${out}/content-check-failure.png`);throw error;}
finally {writeFileSync(`${out}/content-check.json`,JSON.stringify(result,null,2));await c.close();}
