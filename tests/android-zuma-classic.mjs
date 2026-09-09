// Real installed app, real touch input, read-only engine inspection. No fixtures.
// Set WANBA_ENGINE=compat ADB_SERIAL=... GECKO_PORT=2829 on the authorized phone.
// ZUMA_PROFILES=eco,normal,game enables all profiles; default normal samples 30 s.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch,nativeSelectValue} from './android-native-select.mjs';
import {getZumaLevel,zumaPointAt} from '../src/games/plugins/zuma/engine.js';
if(process.env.WANBA_ENGINE==='compat'&&!process.env.ADB_SERIAL)throw Error('Physical compat QA requires explicit ADB_SERIAL');
const out=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/device',raw=process.env.QA_PRIVATE||'.local/qa-zuma-classic-v2/device';
mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const profiles=(process.env.ZUMA_PROFILES||'normal').split(','),sampleMs=Number(process.env.SAMPLE_MS||30000),checks=[];
const storageExpr='Object.fromEntries(["settings","scores","progress","records","sudokuState"].map(k=>"wanbanXiaowu_"+k+"_v1").map(k=>[k,localStorage.getItem(k)]))';
const engineExpr='(()=>{const c=wanbaApp.inspect().controller;if(!c)return null;const {view,...state}=c;return state})()';
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
let c,failed=null,drainCount=0;
const state=()=>c.evaluate(engineExpr);
async function until(fn,label,timeout=15000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){try{last=await fn();if(last)return last}catch(e){last=String(e)}await c.wait(100)}throw Error('Timeout '+label+' '+JSON.stringify(last));}
async function catalog(){
 if(await c.evaluate('!!document.querySelector("#wb-zuma-fullscreen")')){
  if(!await c.evaluate('!document.querySelector(".zc-mask").hidden'))await touch(c,'#wb-zuma-pause');
  const buttons=await c.evaluate('[...document.querySelectorAll(".zc-dialog-buttons button")].map(b=>b.textContent)');
  assert(buttons.at(-1)?.includes('退出'),'Expected Chinese save/exit action');await touch(c,'.zc-dialog-buttons button:last-child');
 }
 for(let i=0;i<4&&await c.evaluate('!!wanbaApp.inspect().game');i++)adb('shell','input','keyevent','4');
 await until(()=>c.evaluate('!wanbaApp.inspect().game'),'catalog');await touch(c,'[data-tab=single]');
}
async function openGame(){
 await catalog();await touch(c,'[data-game=zuma]');await c.wait(250);
 const start=await c.evaluate('document.querySelector("#wb-progress-continue")?"#wb-progress-continue":"#wb-start-cover-btn"');await touch(c,start);
 await until(()=>c.evaluate('!!document.querySelector("#wb-zuma-fullscreen")&&wanbaApp.inspect().controller?.schema===2'),'schema2 portal');
 if(process.env.ZUMA_ALLOW_PENDING_ART!=='1')await until(()=>c.evaluate('wanbaApp.inspect().controller?.view?.assetsReady'),'offline dedicated artwork loaded',30000);
 if(await c.evaluate('!document.querySelector(".zc-mask").hidden'))await touch(c,'.zc-dialog-buttons button:first-child');
 await until(async()=>!(await c.evaluate('wanbaApp.inspect().controller.view.paused')),'playing');await c.wait(400);
}
async function layout(){return c.evaluate(`(()=>{const p=document.querySelector('#wb-zuma-fullscreen');return {url:location.href,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,app:wanbaApp.inspect().appInfo,view:wanbaApp.inspect().controller.view,portal:p.getBoundingClientRect().toJSON(),controls:['.zc-canvas','#wb-zuma-pause','#wb-zuma-swap','#wb-zuma-help'].map(s=>{const e=document.querySelector(s);return{selector:s,rect:e.getBoundingClientRect().toJSON(),width:e.width||null,height:e.height||null}}),nativeImmersiveAvailable:typeof NativeBridge?.setGameImmersive==='function'}})()`);}
function checkLayout(l){assert(Math.abs(l.portal.x)<2&&Math.abs(l.portal.y)<2&&Math.abs(l.portal.width-l.width)<2&&Math.abs(l.portal.height-l.height)<2,'portal fills available app viewport');for(const e of l.controls){const r=e.rect;assert(r.width>20&&r.height>20,e.selector+' usable size');assert(r.x>=-1&&r.y>=-1&&r.right<=l.width+1&&r.bottom<=l.height+1,e.selector+' not clipped');}}
async function readyToFire(){
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  const current=await state();assert(current,'actual game is still active');
  if(current.status==='draining'){
   const first=current,samples=[];const index=++drainCount;let next=current;
   screenshot(`${out}/draining-${index}.png`);
   while(next.status==='draining'&&Date.now()<deadline){
    const sample=await c.evaluate('wanbaApp.inspect().controller');const {view,...fresh}=sample;next=fresh;if(next.status!=='draining')break;
    assert(!view.paused,'draining must animate without an automatic pause');
    samples.push({time:next.drainTime,count:next.chain.length,lives:next.lives});
    await c.wait(150);next=await state();
   }
   assert(['lifeLost','gameOver'].includes(next.status),'draining completes into a life result');
   assert.equal(next.chain.length,0,'all chain balls are swallowed before result');
   assert.equal(next.lives,first.lives-1,'draining costs exactly one life');
   checks.push({check:'naturally reached skull drains entire chain then decrements one life',samples,result:next.status,lives:next.lives});
   screenshot(`${out}/drained-${index}.png`);continue;
  }
  if(['lifeLost','levelComplete'].includes(current.status)){
   await until(()=>c.evaluate('!document.querySelector(".zc-mask").hidden'),'natural result dialog');
   const label=await c.evaluate('document.querySelector(".zc-dialog-buttons button").textContent');
   assert.match(label,current.status==='lifeLost'?/再挑战/:/下一关/);
   await touch(c,'.zc-dialog-buttons button:first-child');
   await until(async()=>{const next=await state();return next.status==='playing'&&!await c.evaluate('wanbaApp.inspect().controller.view.paused')},'real result button continues');
   const next=await state();assert.equal(next.score,current.score,'result button preserves cumulative score');assert.equal(next.lives,current.lives,'result button preserves remaining lives');
   checks.push({check:'natural result continues by real button',status:current.status,label,level:next.levelIndex,lives:next.lives,score:next.score});continue;
  }
  assert.notEqual(current.status,'gameOver','natural run exhausted lives; preserve result for review');
  if(current.status==='playing'&&!current.shot&&current.cooldown<=0)return;
  await c.wait(100);
 }
 throw Error('Timed out waiting for actual playable round');
}
async function fire(){
 await readyToFire();
 const before=await state(),level=getZumaLevel(before.levelIndex,before.layout);
 const targets=before.chain.map(ball=>({ball,point:zumaPointAt(level.path,ball.s)})).filter(({point})=>point.x>level.ballRadius&&point.y>level.ballRadius&&point.x<level.width-level.ballRadius&&point.y<level.height-level.ballRadius);
 const target=targets.find(t=>t.ball.color===before.current)||targets[Math.floor(targets.length/2)];
 const point=target?.point||{x:level.width*.5,y:level.height*.15};
 const p=await c.evaluate(`(()=>{const r=document.querySelector('.zc-canvas').getBoundingClientRect();return{x:r.x+r.width*${point.x/level.width},y:r.y+r.height*${point.y/level.height}}})()`);
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x-3,y:p.y}]});await c.wait(60);
 await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});await c.wait(60);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await until(async()=>{const s=await state();return s.details.shots>before.details.shots?s:false},'real touch fired');
 return {from:before.details.shots,to:after.details.shots,target:point};
}
async function beginFrames(){await c.evaluate('(()=>{const p=window.__zumaFrames={values:[],running:true};let last;const f=t=>{if(!p.running)return;if(last!=null)p.values.push(t-last);last=t;p.id=requestAnimationFrame(f)};p.id=requestAnimationFrame(f);return true})()');}
async function stopFrames(){const intervals=await c.evaluate('(()=>{const p=window.__zumaFrames;p.running=false;cancelAnimationFrame(p.id);return p.values})()'),a=[...intervals].sort((x,y)=>x-y);return{intervals,frames:a.length,rafHz:1000*a.length/a.reduce((n,x)=>n+x,0),p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],over50ms:a.filter(n=>n>50).length,max:a.at(-1)};}
try {
 adb('shell','am','start','--activity-reorder-to-front','-n',activity);c=await connect();
 await catalog();const before=await c.evaluate(storageExpr);writeFileSync(raw+'/before.json',JSON.stringify(before,null,2));
 const content=JSON.parse(await c.evaluate('NativeBridge.getContentState()'));assert(content.bootHealthy);checks.push({check:'trusted installed entry is healthy',snapshotId:content.activeSnapshotId,gamePackage:content.active.packages.find(p=>p.id==='game.zuma')});
 for(const profile of profiles){
  await catalog();await touch(c,'[data-tab=settings]');await nativeSelectValue(c,'#wanba-language','zh-CN');await nativeSelectValue(c,'#wanba-performance',profile);await openGame();
  await readyToFire();const l=await layout();checkLayout(l);assert.equal(l.app.webVersion,'1.2.1');assert.equal(l.app.appVersion,'1.2.1');assert(l.app.versionMatches,'native/web version agrees');if(process.env.ZUMA_ALLOW_PENDING_ART==='1')checks.push({check:'development framework only: dedicated artwork is not a pass condition',artworkVerified:false,assetsReady:l.view.assetsReady});if(process.env.ZUMA_EXPECT_NATIVE_IMMERSIVE==='1')assert(l.nativeImmersiveAvailable,'new APK exposes immersive bridge');
  screenshot(`${out}/${profile}-start.png`);const initial=await state();
  await until(async()=>!(await state()).shot,'shot settled');const colors=await state();await touch(c,'#wb-zuma-swap');const swapped=await state();assert.equal(swapped.current,colors.next);assert.equal(swapped.next,colors.current);
  checks.push({check:'real swap control exchanges two balls',profile,current:swapped.current,next:swapped.next});
  await beginFrames();const shots=[],start=Date.now();while(Date.now()-start<sampleMs){shots.push(await fire());await c.wait(850);}
  const metrics=await stopFrames(),after=await state(),endLayout=await layout();checkLayout(endLayout);assert(shots.length>=3,'at least three real shots');
  checks.push({check:'real aiming/firing and frame sample',profile,layout:l,endLayout,wallDurationMs:Date.now()-start,shots,scoreBefore:initial.score,scoreAfter:after.score,metrics});screenshot(`${out}/${profile}-playing.png`);
  await touch(c,'#wb-zuma-pause');await until(()=>c.evaluate('wanbaApp.inspect().controller.view.paused'),'pause');await c.wait(150);const paused=await state();await c.wait(700);assert.deepEqual(await state(),paused,'all engine fields frozen while paused');
  await touch(c,'#wb-zuma-swap');assert.deepEqual(await state(),paused,'paused swap cannot mutate engine');screenshot(`${out}/${profile}-paused.png`);
  adb('shell','input','keyevent','3');await c.wait(1000);assert.deepEqual(await state(),paused,'background state remains frozen');adb('shell','am','start','--activity-reorder-to-front','-n',activity);await c.wait(600);assert.deepEqual(await state(),paused,'foreground stays paused');
  checks.push({check:'complete engine state freezes during pause, background and foreground until manual continue',profile,stateSHA256:sha(paused)});
  await touch(c,'.zc-dialog-buttons button:first-child');await fire();await touch(c,'#wb-zuma-pause');await c.wait(150);
 }
 // Save through ordinary lifecycle before process reclamation; do not claim
 // immediate crash durability for Gecko's asynchronous localStorage flush.
 await c.evaluate('wanbaApp.save()');adb('shell','input','keyevent','3');await c.wait(10000);const saved=await c.evaluate(storageExpr);writeFileSync(raw+'/before-cold.json',JSON.stringify(saved,null,2));
 await c.close();c=null;adb('shell','am','force-stop',activity.split('/')[0]);adb('shell','am','start','-n',activity);c=await connect();const coldApp=await c.evaluate('wanbaApp.inspect().appInfo');assert.equal(coldApp.webVersion,'1.2.1');assert.equal(coldApp.appVersion,'1.2.1');assert(coldApp.versionMatches);const restored=await c.evaluate(storageExpr);writeFileSync(raw+'/after-cold.json',JSON.stringify(restored,null,2));assert.deepEqual(restored,saved,'all five raw storage keys persist through normal cold launch');
 checks.push({check:'HOME ten-second flush then cold process launch retains all five raw storage keys',app:coldApp,keys:Object.fromEntries(Object.entries(saved).map(([k,v])=>[k,sha(v)]))});
 await openGame();await touch(c,'#wb-zuma-pause');screenshot(`${out}/cold-continued.png`);await catalog();await touch(c,'[data-tab=settings]');await nativeSelectValue(c,'#wanba-performance','normal');await touch(c,'[data-tab=single]');
 await c.syncEvidence();assert.equal(c.errors.length,0,JSON.stringify(c.errors));checks.push({check:'no observed JS errors; actual continue succeeds; restored normal profile and catalog'});screenshot(`${out}/catalog-final.png`);
 console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){failed=String(error).split('\n')[0];process.exitCode=1;writeFileSync(raw+'/failure.txt',String(error.stack||error));try{screenshot(raw+'/failure.png')}catch{}console.error(failed)}
finally{if(c){await c.evaluate('(()=>{const p=window.__zumaFrames;if(p){p.running=false;cancelAnimationFrame(p.id)}wanbaApp.pause();wanbaApp.save();return true})()').catch(()=>{});await c.close();}writeFileSync(out+'/zuma-classic.json',JSON.stringify({passed:!failed,testedAt:new Date().toISOString(),checks,error:failed,note:'rAF scheduling is not GPU presentation or power; no injected game state or artificial fixtures'},null,2));}
