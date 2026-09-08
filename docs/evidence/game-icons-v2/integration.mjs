// Integration smoke against a dedicated disposable Chrome profile and local static server.
// node tests/game-plugin-browser.mjs [CDP port] [local origin]
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const port=Number(process.argv[2]||9348), origin=process.argv[3]||'http://127.0.0.1:8768';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Local development origin required');
const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));
if(!tab)throw Error('No isolated local development page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],requests=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async expression=>{for(let i=0;i<250;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const out='.local/qa-icons-v2';mkdirSync(out,{recursive:true});
try {
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:412,height:820,deviceScaleFactor:1.5,mobile:true});
 await send('Page.navigate',{url:origin+'/standalone/index.html'});await wait(500);await until('!!window.wanbaApp');
 await until('!!document.querySelector("[data-tab]")');
 const expected=JSON.parse(await (await fetch(origin+'/.local/icons-v2.json')).text());
 const seen=[];
 for(const [mode,count] of [['single',23],['double',14]]) {
  await click(`[data-tab="${mode}"]`);await wait(150);
  const items=await evaluate(`Array.from(document.querySelectorAll('[data-game]')).map(el=>{const i=el.querySelector('.wanba-game-icon-v2');return {id:el.dataset.game,icon:i?.dataset.iconGame,background:i?getComputedStyle(i).backgroundImage:'',badge:!!el.querySelector('.wanba-art-icon-mark'),rect:i?{width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height}:null}})`);
  assert.equal(items.length,count);for(const i of items){assert.equal(i.icon,i.id);assert(i.background.includes(expected.games[i.id].path));assert(!i.badge);assert(i.rect.width>0&&i.rect.height>0);seen.push(i.id);}
  await evaluate(`Promise.all([...new Set(Array.from(document.querySelectorAll('.wanba-game-icon-v2')).map(el=>getComputedStyle(el).backgroundImage.slice(5,-2)))].map(src=>new Promise((resolve,reject)=>{const i=new Image;i.onload=resolve;i.onerror=reject;i.src=src})))`);
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/home-'+mode+'-integrated.png',Buffer.from(shot.data,'base64'));
 }
 assert.equal(new Set(seen).size,37);
 // A real card launch uses the unmodified catalog event handler with the new icon DOM.
 await click('[data-tab="single"]');await click('[data-game="match3"]');await wait(150);
 for(let i=0;i<25;i++){if(await evaluate('wanbaApp.inspect().started'))break;const selector=await evaluate(`document.querySelector('#wb-progress-continue')?'#wb-progress-continue':document.querySelector('[data-choice]')?'[data-choice]':document.querySelector('[data-first="user"]')?'[data-first="user"]':'#wb-start-cover-btn'`);await click(selector);await wait(150);}
 await until('wanbaApp.inspect().started');await until('!document.querySelector("#wb-count-cancel,#wb-resume-cancel")');
 const launched=await evaluate('wanbaApp.inspect()');assert.equal(launched.game,'match3');
 await evaluate('wanbaApp.pause();wanbaApp.back()');
 writeFileSync(out+'/integration-result.json',JSON.stringify({passed:true,count:seen.length,uniqueIcons:37,ids:seen,realCardLaunch:'match3',errors,externalRequests:requests.filter(u=>!u.startsWith(origin)&&!u.startsWith('data:'))},null,2));
 assert.equal(errors.length,0);console.log('37 real catalog icons sampled correctly; no old badge; Match3 launched through actual card.');
} finally {socket.close();}
