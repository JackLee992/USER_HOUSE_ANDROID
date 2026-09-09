// Dedicated local browser only. No production mutation hooks; all play uses real input events.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const port=Number(process.env.CDP_PORT||9357),url=process.env.ZUMA_URL||'http://127.0.0.1:8877/standalone/index.html';
const out=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/browser';mkdirSync(out,{recursive:true});
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json(),tab=tabs.find(t=>t.url.startsWith(new URL(url).origin));
if(!tab)throw Error('Dedicated browser tab unavailable');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],checks=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(expression,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout: '+expression);};
const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:"center"})`);await wait(100);const rect=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await touch(rect.x,rect.y);};
async function touch(x,y,dx=0,dy=0){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});if(dx||dy){await wait(90);await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});}await wait(50);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(90);}
const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`${out}/${name}.png`,Buffer.from(r.data,'base64'));};
const state=()=>evaluate('wanbaApp.inspect().controller');
try{
  await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url});await wait(500);await until('!!window.wanbaApp');
  // This is a task-owned development profile, never the phone's storage.
  await evaluate(`localStorage.removeItem('wanbanXiaowu_progress_v1');localStorage.setItem('wanba_locale_v1','zh-CN');localStorage.setItem('wanba_performance_v1',${JSON.stringify(process.env.PERFORMANCE_MODE||'normal')});`);
  await send('Page.reload');await wait(500);await until('!!window.wanbaApp');
  await evaluate('wanbaApp.back()');await click('[data-tab="single"]');await click('[data-game="zuma"]');await click('#wb-start-cover-btn');
  await until('!!document.querySelector("#wb-zuma-fullscreen")');await until('wanbaApp.inspect().controller?.view?.assetsReady',30000);
  await wait(300);assert.equal((await state()).status,'playing');
  // Wait for the visible header skin, so first-pause checks cannot pass merely
  // because delayed atlas loading later happens to trigger a resize.
  await until(`(()=>{const c=document.querySelector('.zc-head > .zc-skin');if(!c)return false;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((n,i)=>i%4===3&&n>0)})()`);

  const portal=await evaluate('(()=>{const r=document.querySelector("#wb-zuma-fullscreen").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,iw:innerWidth,ih:innerHeight};})()');
  assert.equal(portal.x,0);assert.equal(portal.y,0);assert.equal(portal.w,portal.iw);assert.equal(portal.h,portal.ih);checks.push('Independent full viewport, dedicated artwork loaded, no clipped page');
  await screenshot('portrait');
  const before=await state();await click('#wb-zuma-swap');const swapped=await state();assert.equal(swapped.current,before.next);assert.equal(swapped.next,before.current);checks.push('Thumb swap exchanges loaded and preview marble');
  const point=await evaluate('(()=>{const r=document.querySelector(".zc-canvas").getBoundingClientRect();return {x:r.left+r.width*.73,y:r.top+r.height*.20};})()');
  await touch(point.x,point.y,-18,14);assert.equal((await state()).details.shots,before.details.shots+1);checks.push('Hold, drag and release produces one shot');
  await click('#wb-zuma-pause');
  const firstPauseSkin=await evaluate(`(()=>{
    const selectors=['.zc-dialog',...Array.from(document.querySelectorAll('.zc-dialog-buttons button'),(_,i)=>'.zc-dialog-buttons button:nth-child('+(i+1)+')')];
    return selectors.map(selector=>{const el=document.querySelector(selector),rect=el.getBoundingClientRect(),skin=el.querySelector(':scope > .zc-skin'),pixels=skin?.getContext('2d').getImageData(0,0,skin.width,skin.height).data;let painted=0;if(pixels)for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)painted++;return {selector,backgroundImage:getComputedStyle(el).backgroundImage,width:rect.width,height:rect.height,canvasWidth:skin?.width||0,canvasHeight:skin?.height||0,paintedPixels:painted};});
  })()`);
  await screenshot('first-pause');
  for(const skin of firstPauseSkin){if(skin.selector==='.zc-dialog')assert(skin.backgroundImage&&skin.backgroundImage!=='none',skin.selector+' has a visible background');assert(skin.width>0&&skin.height>0,skin.selector+' is visible');assert(skin.paintedPixels>0,skin.selector+' image skin paints on first opening without resize');}
  checks.push({check:'First pause opening paints image skins on the dialog and every button without a resize',skins:firstPauseSkin});
  const paused=await state();await wait(700);const pausedAgain=await state();assert.deepEqual(pausedAgain,paused);checks.push('Pause freezes exact engine state');
  await click('.zc-dialog-buttons button');await until('!wanbaApp.inspect().paused');
  const preRotate=await state();await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});await wait(400);const landscape=await state();assert.equal(landscape.view.layout,'landscape');assert.equal(landscape.score,preRotate.score);assert.equal(landscape.lives,preRotate.lives);assert.equal(landscape.details.shots,preRotate.details.shots);checks.push('Live portrait-to-landscape rotation retains score, lives and shots');
  await screenshot('landscape');await click('#wb-zuma-help');assert.ok((await evaluate('document.querySelector(".zc-dialog p").textContent')).includes('3'));await screenshot('help');await click('.zc-dialog-buttons button');
  await click('#wb-zuma-pause');const beforeExit=await state();await click('.zc-dialog-buttons button:last-child');await until('!document.querySelector("#wb-zuma-fullscreen")');await click('[data-game="zuma"]');await until('!!document.querySelector("#wb-progress-continue")');await click('#wb-progress-continue');await until('!!document.querySelector("#wb-zuma-fullscreen")');assert.equal((await state()).details.shots,beforeExit.details.shots);assert.equal((await state()).score,beforeExit.score);checks.push('Save-and-exit restores game progress');
  assert.deepEqual(errors,[]);const report={passed:true,mode:process.env.PERFORMANCE_MODE||'normal',checks,state:await state()};delete report.state.chain;writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){await screenshot('failure');const report={passed:false,checks,error:error.stack,errors};writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.error(JSON.stringify(report,null,2));process.exitCode=1;}finally{socket.close();}
