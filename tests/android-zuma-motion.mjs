// Visual evidence from actual touch and native screenshots. No game mutation hooks.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';
import {getZumaLevel,zumaPointAt} from '../src/games/plugins/zuma/engine.js';
const serial=process.env.ADB_SERIAL;if(!serial)throw Error('Explicit authorized serial required');
const dir=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/final-motion',raw=process.env.QA_PRIVATE||'.local/qa-zuma-classic-v2/final-motion';mkdirSync(dir,{recursive:true});mkdirSync(raw,{recursive:true});
const recordStart=Date.now(),checks=[];
const c=await connect();let error=null;
try{
 assert(await c.evaluate('!!document.querySelector("#wb-zuma-fullscreen")'),'Actual Zuma must be open');
 if(await c.evaluate('wanbaApp.inspect().controller.view.paused'))await touch(c,'.zc-dialog-buttons button:first-child');
 for(let index=0;index<3;index++){
  let s=await c.evaluate('wanbaApp.inspect().controller');if(s.status!=='playing')break;
  await c.until('!wanbaApp.inspect().controller.shot&&wanbaApp.inspect().controller.cooldown<=0');s=await c.evaluate('wanbaApp.inspect().controller');
  const l=getZumaLevel(s.levelIndex,s.layout),targets=s.chain.map(ball=>({ball,p:zumaPointAt(l.path,ball.s)})).filter(({p})=>p.x>l.ballRadius&&p.x<l.width-l.ballRadius&&p.y>l.ballRadius&&p.y<l.height-l.ballRadius),target=targets.find(t=>t.ball.color===s.current)||targets[0];assert(target);
  const p=await c.evaluate(`(()=>{const r=document.querySelector('.zc-canvas').getBoundingClientRect();return{x:r.x+r.width*${target.p.x/l.width},y:r.y+r.height*${target.p.y/l.height}}})()`);
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.wait(80);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const samples=[];for(let n=0;n<10;n++){const v=await c.evaluate('wanbaApp.inspect().controller');samples.push({ms:Date.now()-recordStart,status:v.status,shots:v.details.shots,score:v.score,view:v.view});if(n===0||n===3)screenshot(`${dir}/shot-${index}-frame-${n}.png`);await c.wait(40)}
  assert(samples.some(v=>v.shots>s.details.shots),'Real fire increments shots');assert(samples.some(v=>v.view.effects.loading>0),'Real fire displays the mouth load animation');
  checks.push({index,beforeShots:s.details.shots,samples});await c.wait(700);
 }
 assert(checks.length>=2,'At least two actual visual shots');
 await touch(c,'#wb-zuma-pause');screenshot(dir+'/motion-end-paused.png');

}catch(e){error=String(e.stack||e);process.exitCode=1;console.error(error)}finally{await c.evaluate('wanbaApp.pause();wanbaApp.save();true').catch(()=>{});await c.close();writeFileSync(dir+'/motion.json',JSON.stringify({passed:!error,checks,error,note:'Real native screenshots around actual shots; OEM does not provide shell screenrecord. Sampling/capture overhead is excluded from the separate performance sample.'},null,2))}
