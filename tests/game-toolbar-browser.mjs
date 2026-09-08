// Real narrow-phone rendering in the dedicated local QA browser.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:8768',port=Number(process.argv[2]||9348),out='.local/qa-game-toolbar';
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json(),tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));if(!tab)throw Error('No isolated local page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map(),errors=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);mkdirSync(out,{recursive:true});
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 const mark=Date.now()+'-'+Math.random();await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__toolbarQA=${JSON.stringify(mark)}`});await send('Page.navigate',{url:origin+'/standalone/index.html'});await until(`window.__toolbarQA===${JSON.stringify(mark)}&&!!window.wanbaApp`);
 await evaluate(`wanbaApp.pause();wanbaApp.back();window.i18nQA=await import('./i18n.js')`);await click('[data-tab="single"]');await click('[data-game="paopao"]');
 for(let n=0;n<25;n++){if(await evaluate('wanbaApp.inspect().started'))break;const selector=await evaluate(`document.querySelector('#wb-progress-continue')?'#wb-progress-continue':document.querySelector('#wb-start-cover-btn')?'#wb-start-cover-btn':null`);if(selector)await click(selector);await wait(200);}
 await until('wanbaApp.inspect().started&&!document.querySelector("#wb-progress-mask")');
 for(const locale of ['zh-CN','zh-TW','en','ja','ko']){
  await evaluate(`await i18nQA.setLocale(${JSON.stringify(locale)})`);
  for(const width of [320,360]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:2,mobile:true});await evaluate(`document.querySelector('#wb-score').textContent='本局：123456'`);await wait(100);
   const layout=await evaluate(`(()=>{const bar=document.querySelector('.wb-toolbar').getBoundingClientRect();const elements=['#wb-back','#wb-game-records','#wb-pause','#wb-restart','#wb-score'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return{selector,text:e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,complete:e.scrollWidth<=e.clientWidth+1}});return{bar:{left:bar.left,right:bar.right},elements,documentFits:document.documentElement.scrollWidth<=innerWidth+1}})()`);
   assert.equal(layout.documentFits,true);for(const item of layout.elements){assert.ok(item.left>=layout.bar.left&&item.right<=layout.bar.right,locale+' '+width+' '+item.selector+' inside');assert.equal(item.complete,true,locale+' '+width+' '+item.selector+' unclipped');}
   for(let a=0;a<layout.elements.length;a++)for(let b=a+1;b<layout.elements.length;b++){const x=layout.elements[a],y=layout.elements[b];assert.ok(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top,locale+' controls do not overlap');}
   results.push({locale,width,...layout});writeFileSync(out+'/'+locale+'-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS all five locales at 320px and 360px: toolbar actions and six-digit score visible, no overlap or document overflow.');
}catch(error){console.error(error);writeFileSync(out+'/failure.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));process.exitCode=1;}
finally{writeFileSync(out+'/result.json',JSON.stringify({passed:process.exitCode!==1,results,errors},null,2));socket.close();}
