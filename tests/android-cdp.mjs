// Android emulator-only production-entry inspection; no gameplay test hooks.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
export const serial=process.env.ADB_SERIAL||'emulator-5554';
export const packageName=process.env.WANBA_PACKAGE||'io.github.jacklee992.wanba';
const adbPath=process.env.ADB||'/Users/jacklee/Library/Android/sdk/platform-tools/adb';
const devtoolsPort=Number(process.env.ANDROID_CDP_PORT||'9224');
export const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
export const screenshot=path=>writeFileSync(path,execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));
export async function connect(){
 let tab;for(let attempt=0;attempt<75;attempt++){try{const pid=adb('shell','pidof',packageName).trim();if(!/^\d+$/.test(pid))throw Error('Wanba not ready');adb('forward','tcp:'+devtoolsPort,'localabstract:webview_devtools_remote_'+pid);const tabs=await(await fetch('http://127.0.0.1:'+devtoolsPort+'/json')).json();tab=tabs.find(t=>t.type==='page'&&/^https:\/\/appassets\.androidplatform\.net\/assets\/(?:updates\/[0-9a-f]{64}\/)?www\/standalone\/index\.html$/.test(t.url));if(tab)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!tab)throw Error('Dedicated Wanba Android entry not found');
 const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 let id=0;const pending=new Map(),errors=[],requests=[];
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(expr,ms=12000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expr))return;await wait(100)}throw Error('Timeout '+expr)};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await send('Runtime.enable');await send('Network.enable');await until('!!window.wanbaApp');
 return {send,evaluate,wait,until,click,errors,requests,close:()=>socket.close()};
}
if(process.argv[1]?.endsWith('/android-cdp.mjs')){const c=await connect();try{console.log(JSON.stringify(await c.evaluate(process.argv[2]||'({state:wanbaApp.inspect(),text:document.body.innerText,buttons:[...document.querySelectorAll("button")].map(b=>({id:b.id,text:b.innerText}))})'),null,2))}finally{c.close()}}
