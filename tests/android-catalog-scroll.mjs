// Real touch scrolling with a separate RAF observer; no style or event-handler patching.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,screenshot,adb} from './android-driver.mjs';
const out=process.env.QA_OUT||'docs/evidence/android-1.2/catalog-device';mkdirSync(out,{recursive:true});
const c=await connect(),swipes=[];let result;
try {
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab="single"]');await c.wait(350);
 const initial=await c.evaluate('({url:location.href,tab:wanbaApp.inspect().tab,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,cards:document.querySelectorAll("[data-game]").length,scrollTop:document.querySelector("#wb-body").scrollTop,scrollHeight:document.querySelector("#wb-body").scrollHeight,clientHeight:document.querySelector("#wb-body").clientHeight})');
 screenshot(`${out}/catalog-before.png`);
 await c.evaluate('(()=>{const s=window.__catalogPerf={intervals:[],mutations:0,done:false};let previous;s.observe=new MutationObserver(records=>s.mutations+=records.length);s.observe.observe(document.querySelector("#wb-body"),{attributes:true,childList:true,subtree:true,characterData:true});const loop=t=>{if(s.done)return;if(previous!=null)s.intervals.push(t-previous);previous=t;s.raf=requestAnimationFrame(loop)};s.raf=requestAnimationFrame(loop);return true})()');
 const start=Date.now();let i=0;
 while(Date.now()-start<Number(process.env.SAMPLE_MS||30000)) {
  const p=await c.evaluate('(()=>{let e=document.querySelector("#wb-body"),r=e.getBoundingClientRect();return{x:r.x+r.width*.5,top:Math.max(150,r.top+70),bottom:Math.min(innerHeight-65,r.bottom-65),scroll:e.scrollTop}})()');
  const up=i++%8<4,y1=up?p.bottom:p.top,y2=up?p.top:p.bottom;
  if(process.env.INPUT_METHOD==='adb') {
   // Android MotionEvents exercise Gecko APZ; Marionette's synthesized moves
   // may dispatch DOM touch events without driving native asynchronous scroll.
   const scale=initial.dpr;
   const nativeTop=Math.max(p.top,initial.height*.28)*scale,nativeBottom=Math.min(p.bottom,initial.height*.78)*scale;
   adb('shell','input','swipe',String(Math.round(p.x*scale)),String(Math.round(up?nativeBottom:nativeTop)),String(Math.round(p.x*scale)),String(Math.round(up?nativeTop:nativeBottom)),'450');
  }else {
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:y1}]});await c.wait(35);
  for(let tick=1;tick<=7;tick++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:y1+(y2-y1)*tick/7}]});await c.wait(35)}
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await c.wait(350);
  swipes.push({direction:up?'up':'down',before:p.scroll,after:await c.evaluate('document.querySelector("#wb-body").scrollTop')});
  assert.equal(await c.evaluate('wanbaApp.inspect().game'),null,'scroll must not accidentally open a game');
 }
 const measured=await c.evaluate('(()=>{const s=window.__catalogPerf;s.done=true;cancelAnimationFrame(s.raf);s.observe.disconnect();return {intervals:s.intervals,mutations:s.mutations}})()'),a=[...measured.intervals].sort((x,y)=>x-y),sum=a.reduce((n,x)=>n+x,0);
 const metrics={sampleMs:Date.now()-start,frames:a.length,rafHz:1000*a.length/sum,intervalP95:a[Math.floor(a.length*.95)],intervalP99:a[Math.floor(a.length*.99)],over50ms:a.filter(x=>x>50).length,domMutations:measured.mutations,movedSwipes:swipes.filter(s=>Math.abs(s.after-s.before)>20).length,totalSwipes:swipes.length};
 result={passed:true,inputMethod:process.env.INPUT_METHOD||'webdriver',initial,metrics,swipes,rawIntervals:measured.intervals,note:'RAF scheduling and actual scrollTop changes, not GPU presentation or power measurement. Boundaries can legitimately stop individual swipes.'};
 if(process.env.REQUIRE_SCROLL==='1')assert.ok(metrics.movedSwipes>=swipes.length*.4,'at least 40% of alternating swipes should move the scroll container');
 screenshot(`${out}/catalog-after.png`);console.log(JSON.stringify({passed:true,metrics}));
}catch(error){result={passed:false,error:String(error),swipes};screenshot(`${out}/failure.png`);throw error}
finally{await c.evaluate('(()=>{let s=window.__catalogPerf;if(s){s.done=true;cancelAnimationFrame(s.raf);s.observe.disconnect()}})()').catch(()=>{});writeFileSync(`${out}/catalog-scroll.json`,JSON.stringify(result,null,2));await c.close()}
