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
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1240,height:760,deviceScaleFactor:1,mobile:false});
 for(const page of ['sheet-01','sheet-02','sheet-03','sheet-04','sheet-05','all-48','all-72']) {
  const name=page.startsWith('sheet')?page+'-preview':page;
  await send('Page.navigate',{url:origin+'/.local/qa-icons-v2/'+name+'.html'});await wait(200);
  await until('window.iconsReady===true');
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+page+'-size-check.png',Buffer.from(shot.data,'base64'));
 }
 console.log('Icon atlas native-size preview captured');
} finally {socket.close();}
