// GeckoView's official debug-only Marionette transport; no test hooks in the shipped app.
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
export const serial=process.env.ADB_SERIAL||'emulator-5554';
export const packageId='io.github.jacklee992.wanba.compat';
export const activity=packageId+'/io.github.jacklee992.wanba.CompatActivity';
export const origin='http://127.0.0.1:38657';
const adbBinary=process.env.ADB||'/Users/jacklee/Library/Android/sdk/platform-tools/adb';
export const adb=(...args)=>execFileSync(adbBinary,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
export const screenshot=path=>writeFileSync(path,execFileSync(adbBinary,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));
export function touchActions(type,points) {
 return points.map((p,i)=>({type:'pointer',id:'finger'+(p.id??i),parameters:{pointerType:'touch'},actions:[
  {type:'pointerMove',duration:0,x:Math.round(p.x),y:Math.round(p.y),origin:'viewport'},
  // Gecko 155's synchronous multi-touch synthesis can emit two touchstarts but
  // only the first pointerdown when both contacts begin in one tick. Android
  // contacts arrive as DOWN then POINTER_DOWN; preserve that sequence while
  // retaining the first depressed finger as the second lands.
  ...(type==='touchStart'?points.map((_,tick)=>tick===i?{type:'pointerDown',button:0}:{type:'pause',duration:20}):[]),
 ]}));
}
export async function connect(){
 let last;
 const deadline=Date.now()+20000;
 do { try { return await connectOnce(); } catch(error) { last=error;if(!/Marionette.*(?:listening|greeting)|ECONNREFUSED/.test(String(error)))throw error;await new Promise(resolve=>setTimeout(resolve,250)); } } while(Date.now()<deadline);
 throw last;
}
async function connectOnce(){
 const port=Number(process.env.GECKO_PORT||2829);adb('forward',`tcp:${port}`,'tcp:2828');
 const socket=net.connect(port,'127.0.0.1');let buffer=Buffer.alloc(0),next=0;const pending=new Map();
 let greet;const greeting=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.destroy();reject(Error('Marionette greeting timeout; start the debug APK with its Gecko automation config'));},4000);
  greet=value=>{clearTimeout(timer);resolve(value);};
  socket.once('error',error=>{clearTimeout(timer);reject(error);});
  socket.once('close',()=>{clearTimeout(timer);reject(Error('Marionette is not listening yet'));});
 });
 socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(true){const colon=buffer.indexOf(58);if(colon<0)break;const size=Number(buffer.subarray(0,colon).toString());if(buffer.length<colon+1+size)break;const message=JSON.parse(buffer.subarray(colon+1,colon+1+size));buffer=buffer.subarray(colon+1+size);
   if(!Array.isArray(message)){greet(message);continue;}const p=pending.get(message[1]);if(p){pending.delete(message[1]);clearTimeout(p.timer);message[2]?p.reject(Error(JSON.stringify(message[2]))):p.resolve(message[3]);}
  }
 });
 const command=(name,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+name));},30000);pending.set(id,{resolve,reject,timer});const data=JSON.stringify([0,id,name,params]);socket.write(Buffer.byteLength(data)+':'+data);});
 await greeting;
 try {
 await command('WebDriver:NewSession',{capabilities:{alwaysMatch:{acceptInsecureCerts:false}}});
 const evaluate=async expression=>{
  let script=`return (${expression});`;
  try { new Function(script); } catch { script=expression; }
  return (await command('WebDriver:ExecuteScript',{script,args:[],newSandbox:false,sandbox:null})).value;
 };
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(expr,ms=12000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expr))return;await wait(100)}throw Error('Timeout '+expr);};
 await until('!!window.wanbaApp');
 if(await evaluate('location.href')!==origin+'/assets/www/standalone/index.html')throw Error('Wrong Gecko page');
 await evaluate('(()=>{window.__wanbaQaErrors=[];addEventListener("error",e=>__wanbaQaErrors.push({message:e.message,file:e.filename,line:e.lineno}));addEventListener("unhandledrejection",e=>__wanbaQaErrors.push({message:String(e.reason)}));return true;})()');
 const errors=[],requests=[];
 const syncEvidence=async()=>{errors.splice(0,errors.length,...await evaluate('window.__wanbaQaErrors||[]'));requests.splice(0,requests.length,...await evaluate('[...performance.getEntriesByType("resource").map(r=>r.name),...[...document.querySelectorAll("iframe")].flatMap(f=>{try{return f.contentWindow.performance.getEntriesByType("resource").map(r=>r.name)}catch{return []}})]'));};
 const send=async(method,params={})=>{
  if(method==='Page.reload'){await command('WebDriver:Refresh');await until('!!window.wanbaApp');await evaluate('(()=>{window.__wanbaQaErrors=[];addEventListener("error",e=>__wanbaQaErrors.push({message:e.message,file:e.filename,line:e.lineno}));addEventListener("unhandledrejection",e=>__wanbaQaErrors.push({message:String(e.reason)}));return true;})()');return;}
  if(method==='Input.dispatchTouchEvent'){
   if(params.type==='touchEnd'||params.type==='touchCancel')return command('WebDriver:ReleaseActions');
   return command('WebDriver:PerformActions',{actions:touchActions(params.type,params.touchPoints)});
  }
  throw Error('Unsupported Gecko adapter command '+method);
 };
 return {evaluate,command,send,wait,until,click:selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),errors,requests,syncEvidence,close:async()=>{try{await command('WebDriver:DeleteSession');}finally{socket.destroy();}}};
 } catch(error) { socket.destroy();throw error; }
}
if(process.argv[1]?.endsWith('/android-gecko.mjs')){const c=await connect();try{console.log(JSON.stringify(await c.evaluate(process.argv[2]||'({ua:navigator.userAgent,state:wanbaApp.inspect(),text:document.body.innerText})'),null,2));}finally{c.close();}}
