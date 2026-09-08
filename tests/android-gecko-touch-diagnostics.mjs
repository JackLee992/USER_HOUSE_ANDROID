// Read-only DOM event instrumentation around real Gecko WebDriver touch actions.
// Does not dispatch DOM events or change game state through a test hook.
import {connect,screenshot,adb,activity} from './android-gecko.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.env.QA_OUT||'.local/qa-v1.1.0/touch-diagnostics';mkdirSync(out,{recursive:true});
adb('shell','am','start','--activity-reorder-to-front','-n',activity);
const c=await connect(),results=[];
try {
  await c.until('!document.hidden');
  await c.command('WebDriver:ReleaseActions');
  if(await c.evaluate('wanbaApp.inspect().paused')) { await c.click('#wb-pause');await c.until('!wanbaApp.inspect().paused'); }
  await c.evaluate(`(()=>{
    window.__wanbaTouchTrace=[];
    const types=['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','touchstart','touchend','touchcancel'];
    const listener=e=>window.__wanbaTouchTrace.push({type:e.type,id:e.pointerId,primary:e.isPrimary,trusted:e.isTrusted,target:e.target.dataset.action,x:e.clientX,y:e.clientY,touches:e.touches?[...e.touches].map(t=>({id:t.identifier,x:t.clientX,y:t.clientY,target:t.target.dataset.action})):undefined});
    window.__wanbaTouchCleanup?.(); types.forEach(type=>document.addEventListener(type,listener,true));window.__wanbaTouchCleanup=()=>types.forEach(type=>document.removeEventListener(type,listener,true));
  })()`);
  const points=await c.evaluate('[...document.querySelectorAll(".cd-controls [data-action=left],.cd-controls [data-action=right]")].map(e=>{const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})');
  for(const staggered of [false,true]) {
    await c.command('WebDriver:ReleaseActions');await c.evaluate('window.__wanbaTouchTrace=[]');
    const actions=points.map((p,i)=>({type:'pointer',id:'finger'+i,parameters:{pointerType:'touch'},actions:[
      {type:'pointerMove',duration:0,origin:'viewport',...p},
      ...(staggered?points.map((_,tick)=>tick===i?{type:'pointerDown',button:0}:{type:'pause',duration:20}):[{type:'pointerDown',button:0}]),
    ]}));
    await c.command('WebDriver:PerformActions',{actions});await c.wait(200);
    const result={staggered,points,...await c.evaluate('({held:[...document.querySelectorAll(".cd-held")].map(b=>b.dataset.action),events:__wanbaTouchTrace,paused:wanbaApp.inspect().paused})')};
    results.push(result);screenshot(`${out}/${staggered?'staggered':'simultaneous'}.png`);
    await c.command('WebDriver:ReleaseActions');await c.wait(150);
  }
  console.log(JSON.stringify(results,null,2));
} finally {writeFileSync(`${out}/events.json`,JSON.stringify(results,null,2));await c.evaluate('window.__wanbaTouchCleanup?.()').catch(()=>{});await c.close();}
