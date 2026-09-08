// UI contract only. Native ZIP/signature/activation is tested separately on Android.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const port=Number(process.argv[2]||9357),origin=process.argv[3]||'http://127.0.0.1:8877';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Dedicated local origin required');
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json(),tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin)));
if(!tab)throw Error('No isolated test page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let id=0;const pending=new Map(),errors=[],checks=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=s=>evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);
const out='docs/evidence/android-1.2/update-web';mkdirSync(out,{recursive:true});
const bridge=`(()=>{
localStorage.setItem('wanba_locale_v1','zh-CN');
window.qaCalls=[];
const active={snapshotId:'old',snapshotVersion:'1.0.0',runtimeApi:1,packages:[{id:'core',version:'1.0.0',sha256:'core'},{id:'game.match3',version:'1.0.0',sha256:'old-game',size:100}],games:{match3:{version:'1.0.0',saveSchema:3,art:[]}}};
const candidate={...active,snapshotId:'new',snapshotVersion:'1.0.1',packages:[active.packages[0],{id:'game.match3',version:'1.0.1',sha256:'new-game',size:250}],games:{match3:{version:'1.0.1',saveSchema:3,art:[]}}};
window.qaState={activeSnapshotId:'old',active,candidate:null,previousSnapshotId:null,job:null,bootHealthy:false};
const notify=()=>window.wanbaApp?.onGameUpdate('{}');
window.NativeBridge={getContentState:()=>JSON.stringify(qaState),reportGameContentReady:()=>{qaCalls.push('health-request');setTimeout(()=>{qaState.bootHealthy=true;notify();},150);return JSON.stringify({accepted:true});},checkGameUpdates:()=>{qaCalls.push('check');qaState.candidate=candidate;qaState.job={state:'available',message:'发现可用的游戏内容更新'};notify();return '{"jobId":"check"}';},downloadGameUpdate:id=>{qaCalls.push(['download',id]);qaState.candidateReady=true;qaState.job={state:'ready',message:'下载完成，回到首页后可安装'};notify();return '{"jobId":"download"}';},activateGameUpdate:(id,checkpoint)=>{qaCalls.push(['activate',id,JSON.parse(checkpoint)]);return '{"jobId":"activate"}';},rollbackGameUpdate:()=>{qaCalls.push('rollback');return '{"jobId":"rollback"}';}};
})();`;
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:3,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:bridge});await send('Page.navigate',{url:origin+'/standalone/index.html'});await until('!!window.wanbaApp');
 assert.equal(await evaluate('qaState.bootHealthy'),true);assert.equal(await evaluate('!!document.querySelector("#wanba-boot")'),false);checks.push('boot stays locked until the asynchronous health marker commits');
 await evaluate('wanbaApp.back()');await click('[data-tab="single"]');await until('!!document.querySelector("#wanba-check-games")');
 await click('#wanba-check-games');await until('!!document.querySelector("#wanba-install-games")');
 assert.match(await evaluate('document.querySelector(".wanba-updates summary").textContent'),/1 个资源包/);await click('.wanba-updates summary');
 assert.equal(await evaluate('document.querySelectorAll(".wanba-updates li").length'),1);await click('#wanba-install-games');await until('document.querySelector("#wanba-install-games").textContent.includes("安装")');
 assert.equal(await evaluate('wanbaApp.inspect().game'),null);await click('#wanba-install-games');await until('qaCalls.some(c=>Array.isArray(c)&&c[0]==="activate")');
 const activation=await evaluate('qaCalls.find(c=>Array.isArray(c)&&c[0]==="activate")');assert.equal(activation[1],'new');assert.equal(activation[2].ok,true);assert.equal(activation[2].idle,true);assert.equal(Object.keys(activation[2].storage).length,5);checks.push('one-package preview → download → home-only activation with five-key checkpoint');
 await click('[data-game="freecell"]');await click('#wb-start-cover-btn');await until('wanbaApp.inspect().started');assert.equal(await evaluate('!!document.querySelector("#wanba-install-games")'),false);await evaluate('wanbaApp.pause();wanbaApp.back()');await until('!!document.querySelector("#wanba-check-games")');checks.push('update controls are absent during a game; progress survives return home');
 await evaluate('qaState.candidate=null;qaState.candidateReady=false;qaState.job=null;wanbaApp.onGameUpdate("{}");document.querySelector("#wb-body").scrollTop=0');await wait(200);
 const before=await evaluate('qaCalls.filter(c=>c==="check").length'),point=await evaluate('(()=>{const r=document.querySelector(".wanba-update-status").getBoundingClientRect();return {x:r.x+20,y:r.y+5};})()');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+100}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until(`qaCalls.filter(c=>c==='check').length>${before}`);checks.push('real browser touch gesture at list top triggers pull-to-refresh');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);assert.equal(errors.length,0,JSON.stringify(errors));
 const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/update-panel.png',Buffer.from(shot.data,'base64'));writeFileSync(out+'/result.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{socket.close();}
