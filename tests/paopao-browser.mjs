// Run only against an isolated QA browser profile and local development origin.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const port=Number(process.env.CDP_PORT||9357),origin=process.env.QA_ORIGIN||'http://127.0.0.1:8877';
const out=process.env.QA_OUT||'.local/qa-bubbles-pastel-v5/browser';mkdirSync(out,{recursive:true});
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab=tabs.find(t=>t.type==='page'&&t.url.startsWith(origin+'/'));if(!tab)throw Error('Isolated local tab unavailable');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[],checks=[];
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await wait(70);}throw Error('Timeout: '+expression);}
async function touch(x,y){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await wait(50);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(90);}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await touch(p.x,p.y);}
const shot=async name=>writeFileSync(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const saved=()=>evaluate(`wanbaApp.save();JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).paopao`);
async function navigate(){await send('Page.navigate',{url:origin+'/standalone/index.html'});await wait(350);await until('!!window.wanbaApp');}
async function begin(){await click('[data-tab="single"]');await click('[data-game="paopao"]');for(let i=0;i<40;i++){if(await evaluate('wanbaApp.inspect().started'))break;const selector=await evaluate('document.querySelector("#wb-progress-continue")?"#wb-progress-continue":document.querySelector("#wb-start-cover-btn")?"#wb-start-cover-btn":null');if(selector)await click(selector);await wait(200);}await until('wanbaApp.inspect().started');await wait(200);}
async function bounds(){return evaluate(`(()=>{const c=document.querySelector('#wb-paopao-canvas'),b=document.querySelector('#wb-gamebox').getBoundingClientRect(),r=c.getBoundingClientRect();return{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,inside:r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1,art:c.dataset.gameArt,controls:[...document.querySelectorAll('#wb-paopao-swap,#wb-paopao-bomb')].map(e=>{const q=e.getBoundingClientRect();return{left:q.left,top:q.top,right:q.right,bottom:q.bottom}}),viewport:{w:innerWidth,h:innerHeight}}})()`);}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});await navigate();
 // This local-only browser profile contains no user progress.
 await evaluate(`wanbaApp.back();localStorage.clear();localStorage.setItem('wanba_locale_v1','zh-CN');localStorage.setItem('wanbanXiaowu_settings_v1',JSON.stringify({theme:'day',companion:false}));`);
 for(const mode of ['eco','normal','game']){
  await evaluate(`localStorage.setItem('wanba_performance_v1',${JSON.stringify(mode)});localStorage.removeItem('wanbanXiaowu_progress_v1');`);await navigate();await begin();
  await until(`document.querySelector('#wb-paopao-canvas')?.dataset.paopaoArt==='pastel-v5'`);await wait(180);
  const b=await bounds();assert.equal(b.width,Math.floor(b.cssWidth*({eco:1,normal:2,game:3}[mode])));assert(b.inside,JSON.stringify(b));
  for(const r of b.controls)assert(r.left>=0&&r.top>=0&&r.right<=b.viewport.w&&r.bottom<=b.viewport.h);
  await shot(mode+'-board');
  // Wrap just the live context, keeping production scheduling/physics intact.
  await evaluate(`(()=>{const ctx=document.querySelector('#wb-paopao-canvas').getContext('2d'),clear=ctx.clearRect;window.__bubbleDraws=0;ctx.clearRect=function(...args){window.__bubbleDraws++;return clear.apply(this,args)}})()`);
  await wait(700);assert.equal(await evaluate('__bubbleDraws'),0,'idle board has no redraws');
  const before=await saved();await click('#wb-paopao-swap');const swapped=await saved();assert.equal(swapped.current,before.next);assert.equal(swapped.next,before.current);
  const p=await evaluate(`(()=>{const r=document.querySelector('#wb-paopao-canvas').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.3}})()`);await touch(p.x,p.y);
  await until(`(()=>{wanbaApp.save();return JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).paopao.shots>${before.shots}})()`);await wait(900);
  assert(await evaluate('__bubbleDraws>3'),'real shot animation rendered');const after=await saved();
  await evaluate('wanbaApp.pause()');const n=await evaluate('__bubbleDraws');await wait(400);assert.equal(await evaluate('__bubbleDraws'),n);
  await evaluate('wanbaApp.save();wanbaApp.back()');await navigate();await begin();const resumed=await saved();
  for(const key of ['bubbles','score','shots','pushes','current','next','bombs'])assert.deepEqual(resumed[key],after[key],key+' restored');
  checks.push({mode,canvas:b,realTouchSwapAndShot:true,idleRedraws:0,pausedRedraws:0,coldSaveRestore:true});await evaluate('wanbaApp.pause();wanbaApp.back()');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:2,mobile:true});await begin();assert((await bounds()).inside);await shot('narrow-320');await evaluate('wanbaApp.pause();wanbaApp.back()');
 checks.push({narrow320CanvasAndPreviewVisible:true});
 // Validate production renderer pixels independently of the game's random board.
 const pixels=await evaluate(`(async()=>{const m=await import('../src/games/plugins/paopao/bubble-art.js');const art=m.createBubbleArt({window,document});if(!art.ready)throw Error('Pastel art is not immediately ready');const rows=[];for(const size of [19,24,30,48])for(const color of m.BUBBLE_COLOR_ORDER){const c=document.createElement('canvas');c.width=c.height=size*2;const ctx=c.getContext('2d');ctx.scale(2,2);art.draw(ctx,color,size/2,size/2,size);const p=ctx.getImageData(0,0,c.width,c.height).data;rows.push({size,color,corners:[3,(c.width-1)*4+3,((c.height-1)*c.width)*4+3,p.length-1].map(i=>p[i]),centerAlpha:p[(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4+3]});}art.destroy();return rows})()`);
 for(const r of pixels){assert.deepEqual(r.corners,[0,0,0,0]);assert(r.centerAlpha>220);}checks.push({productionSpritePixels:pixels});
 // The old neon atlas is no longer a runtime dependency; blocking it cannot change play.
 await send('Network.setBlockedURLs',{urls:['*assets/game-art/paopao/bubbles-v4.png*']});await navigate();await begin();await wait(250);
 assert.equal(await evaluate('document.querySelector("#wb-paopao-canvas").dataset.paopaoArt'),'pastel-v5');await shot('no-neon-atlas-dependency');
 const s=await saved(),p=await evaluate(`(()=>{const r=document.querySelector('#wb-paopao-canvas').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height*.3}})()`);await touch(p.x,p.y);await until(`(()=>{wanbaApp.save();return JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).paopao.shots>${s.shots}})()`);
 checks.push({oldNeonAtlasBlockedAndShotStillWorks:true});await evaluate('wanbaApp.pause();wanbaApp.back()');await send('Network.setBlockedURLs',{urls:[]});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){process.exitCode=1;checks.push({error:error.stack});await shot('failure');console.error(error);}finally{await send('Network.setBlockedURLs',{urls:[]});writeFileSync(`${out}/result.json`,JSON.stringify({passed:process.exitCode!==1,checks,errors},null,2)+'\n');ws.close();}
