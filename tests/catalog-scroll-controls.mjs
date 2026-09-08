// Scroll/navigation regression across all locales and rendering preferences.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:8768',port=Number(process.argv[2]||9348),out='.local/qa-catalog-scroll/controls';
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json(),tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));if(!tab)throw Error('No isolated local page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map(),errors=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);mkdirSync(out,{recursive:true});
async function scroll(distance){const point=await evaluate(`(()=>{const r=document.querySelector('#wb-body').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.65}})()`);await send('Input.synthesizeScrollGesture',{...point,yDistance:distance,speed:2200,gestureSourceType:'touch',preventFling:true});await wait(70);return evaluate('document.querySelector("#wb-body").scrollTop');}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:3,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const mark=Date.now()+'-'+Math.random();await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__catalogControlsQA=${JSON.stringify(mark)}`});await send('Page.navigate',{url:origin+'/standalone/index.html'});await until(`window.__catalogControlsQA===${JSON.stringify(mark)}&&!!window.wanbaApp`);await evaluate(`wanbaApp.pause();wanbaApp.back();window.ccI18n=await import('./i18n.js');window.ccPerf=await import('./performance.js')`);
 for(const locale of ['zh-CN','zh-TW','en','ja','ko'])for(const mode of ['eco','normal','game']){
  await evaluate(`await ccI18n.setLocale(${JSON.stringify(locale)});ccPerf.setPerformanceMode(${JSON.stringify(mode)})`);
  for(const tab of ['single','double']){
   await click(`[data-tab="${tab}"]`);await wait(90);assert.equal(await evaluate('document.querySelectorAll(".wb-game-card").length'),tab==='single'?23:14);
   assert.ok(await scroll(-500)>350,locale+'/'+mode+'/'+tab+' scrolls down');assert.ok(await scroll(650)<10,locale+'/'+mode+'/'+tab+' returns to top');assert.equal(await evaluate('wanbaApp.inspect().game'),null);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  }
  results.push({locale,mode,solo23:true,computer14:true,scrollBothDirections:true,noUnintendedGame:true});
 }
 // Horizontal tab switching remains available; vertical scrolling stays native.
 await click('[data-tab="single"]');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:295,y:430}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:432}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:50,y:435}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until('document.querySelectorAll(".wb-game-card").length===14');
 assert.equal(await evaluate('wanbaApp.inspect().game'),null);results.push({horizontalTabSwipe:true});
 await evaluate(`await ccI18n.setLocale('en');ccPerf.setPerformanceMode('normal')`);await click('[data-tab="single"]');
 writeFileSync(out+'/english-home.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await click('[data-game="freecell"]');await until('!!document.querySelector("#wb-gamebox")');assert.equal(await evaluate('wanbaApp.inspect().game'),'freecell');await evaluate('wanbaApp.back()');results.push({gameEntryAndReturn:true});
 assert.deepEqual(errors,[]);console.log('PASS 5 locales × 3 modes × both 23/14 game lists: real two-way scroll, horizontal tabs, entry/return, no accidental game or horizontal overflow.');
}catch(error){console.error(error);writeFileSync(out+'/failure.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));process.exitCode=1;}
finally{writeFileSync(out+'/result.json',JSON.stringify({passed:process.exitCode!==1,results,errors},null,2));socket.close();}
