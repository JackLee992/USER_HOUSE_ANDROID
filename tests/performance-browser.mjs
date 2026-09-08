// Use only the disposable QA Chrome profile on this local development origin.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:8768',port=Number(process.argv[2]||9348),out='.local/qa-performance-modes';
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));if(!tab)throw Error('No isolated local page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const until=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function navigate(){const mark=Date.now()+'-'+Math.random();await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wanbaPerformanceQA=${JSON.stringify(mark)}`});await send('Page.navigate',{url:origin+'/standalone/index.html'});await until(`window.__wanbaPerformanceQA===${JSON.stringify(mark)}&&!!window.wanbaApp`);}
async function start(game){await click('[data-tab="single"]');await click(`[data-game="${game}"]`);for(let n=0;n<25;n++){if(await evaluate('wanbaApp.inspect().started'))break;const selector=await evaluate(`document.querySelector('#wb-progress-continue')?'#wb-progress-continue':document.querySelector('#wb-start-cover-btn')?'#wb-start-cover-btn':null`);if(selector)await click(selector);await wait(200);}await until('wanbaApp.inspect().started');await wait(100);}
async function capture(name){writeFileSync(out+'/'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
mkdirSync(out,{recursive:true});
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setDeviceMetricsOverride',{width:412,height:820,deviceScaleFactor:3,mobile:true});
 await navigate();await evaluate(`wanbaApp.pause();wanbaApp.back();localStorage.clear();localStorage.setItem('wanba_locale_v1','en')`);await navigate();await until('document.documentElement.lang==="en"');
 assert.equal(await evaluate('document.documentElement.dataset.wanbaPerformance'),'normal');
 for(const mode of ['eco','normal','game']){
  await click('[data-tab="settings"]');await until('!!document.querySelector("#wanba-performance")');
  await evaluate(`(()=>{const select=document.querySelector('#wanba-performance');select.value=${JSON.stringify(mode)};select.dispatchEvent(new Event('change'));})()`);await wait(80);
  assert.equal(await evaluate('localStorage.getItem("wanba_performance_v1")'),mode);assert.equal(await evaluate('document.documentElement.dataset.wanbaPerformance'),mode);
  for(const game of ['paopao','game1010']){
   await start(game);const canvas=await evaluate(`(()=>{const c=document.querySelector('#wb-gamebox canvas'),r=c.getBoundingClientRect(),b=document.querySelector('#wb-gamebox').getBoundingClientRect();return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,inside:r.left>=b.left-1&&r.right<=b.right+1};})()`);
   const dpr={eco:1,normal:2,game:3}[mode];assert.equal(canvas.width,Math.floor(canvas.cssWidth*dpr));assert.equal(canvas.height,Math.floor(canvas.cssHeight*dpr));assert.equal(canvas.inside,true);
   const row={mode,game,canvas};await capture(mode+'-'+game);
   if(game==='paopao'){
    // QA-only draw counter wraps this single context, never global Canvas or animation clocks.
    await evaluate(`(()=>{const ctx=document.querySelector('#wb-paopao-canvas').getContext('2d');window.__drawQA={draws:0,clear:ctx.clearRect};ctx.clearRect=function(...args){__drawQA.draws++;return __drawQA.clear.apply(this,args)};})()`);
    await wait(700);assert.equal(await evaluate('__drawQA.draws'),0,'idle redraws');
    const position=await evaluate(`(()=>{const r=document.querySelector('#wb-paopao-canvas').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.35}})()`);
    const before=await evaluate(`wanbaApp.save();JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).paopao.shots`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});await wait(60);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});
    await until(`(()=>{wanbaApp.save();return JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).paopao.shots>${before}})()`);
    assert.ok(await evaluate('__drawQA.draws>2'),'shot animation remains visible');row.shotResolved=true;row.animationDraws=await evaluate('__drawQA.draws');
    await evaluate('wanbaApp.pause()');const paused=await evaluate('__drawQA.draws');await wait(200);assert.equal(await evaluate('__drawQA.draws'),paused);row.pausedRedraws=0;row.idleRedraws=0;
   }
   results.push(row);await evaluate('wanbaApp.pause();wanbaApp.back()');
  }
 }
 await navigate();assert.equal(await evaluate('document.documentElement.dataset.wanbaPerformance'),'game');results.push({preferencePersistsOnReload:true});
 // Check the renderer's narrowest supported phone layout, including staggered right-hand bubbles.
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:3,mobile:true});await start('paopao');
 const bounds=await evaluate(`(()=>{const c=document.querySelector('#wb-paopao-canvas').getBoundingClientRect(),b=document.querySelector('#wb-gamebox').getBoundingClientRect();return{left:c.left,right:c.right,boxLeft:b.left,boxRight:b.right,viewport:innerWidth}})()`);assert.ok(bounds.left>=bounds.boxLeft-1&&bounds.right<=bounds.boxRight+1);await capture('narrow-320-paopao');results.push({narrowCanvas:bounds});await evaluate('wanbaApp.pause();wanbaApp.back()');
 await send('Emulation.setDeviceMetricsOverride',{width:360,height:760,deviceScaleFactor:2,mobile:true});
 await evaluate(`window.__i18nQA=await import('./i18n.js');window.NativeBridge={getContentState:()=>JSON.stringify({job:{state:'upToDate',message:'游戏内容已是最新'}}),checkGameUpdates:()=>({ok:true})}`);
 for(const locale of ['zh-CN','zh-TW','en','ja','ko']){
  await click('[data-tab="settings"]');await evaluate(`await __i18nQA.setLocale(${JSON.stringify(locale)})`);await wait(80);
  const catalog=await evaluate(`await (await fetch('../locales/${locale}.json')).json()`);
  assert.equal(await evaluate('document.querySelector("label[for=wanba-performance]").textContent'),catalog.strings['性能模式']);
  assert.equal(await evaluate('document.querySelector("#wanba-performance option[value=eco]").textContent'),catalog.strings['省电']);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await evaluate('document.querySelector("#wanba-performance").scrollIntoView({block:"center"})');await capture(locale+'-settings');
  await click('[data-tab="single"]');await evaluate('wanbaApp.onGameUpdate()');await until(`document.querySelector('#wanba-update-status')?.textContent===${JSON.stringify(catalog.strings['游戏内容已是最新'])}`);await capture(locale+'-update-state');
  results.push({locale,performanceSettings:true,nativeStatusTranslation:true,width:360});
 }
 assert.deepEqual(errors,[]);console.log('PASS all three modes: actual Canvas DPR, idle/pause no redraw, real shots, persistence, 320px bubble bounds, five-language settings/native update state.');
}catch(error){console.error(error);await capture('failure');process.exitCode=1;}
finally{writeFileSync(out+'/result.json',JSON.stringify({passed:process.exitCode!==1,results,errors},null,2));socket.close();}
