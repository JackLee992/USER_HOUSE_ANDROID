// Read-only frame observers plus real WebDriver touch input; no game hooks or RAF replacement.
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-gecko.mjs';
import {nativeSelectValue} from './android-native-select.mjs';
if(process.env.PERF_PROFILE&&process.env.WANBA_ENGINE!=='compat')throw Error('PERF_PROFILE requires WANBA_ENGINE=compat so native selection targets the same device');
const out=process.env.QA_OUT||'docs/evidence/android-1.2/compat-phone/performance-content1';
const duration=Number(process.env.SAMPLE_MS||30000),games=(process.env.PERF_GAMES||'paopao,match3,pinball,jump').split(',');
mkdirSync(out,{recursive:true});adb('shell','am','start','--activity-reorder-to-front','-n',activity);
const c=await connect(),results=[];
const touch=async(selector,hold=70,fraction={x:.5,y:.5})=>{
 const p=await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width*${fraction.x},y:r.y+r.height*${fraction.y}}})()`);
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.wait(hold);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
};
const open=async id=>{
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab="single"]');await c.click(`[data-game="${id}"]`);await c.wait(250);
 if(await c.evaluate('!!document.querySelector("#wb-progress-continue")'))await c.click('#wb-progress-continue');else await c.click('#wb-start-cover-btn');
 await c.until('wanbaApp.inspect().started');if(await c.evaluate('wanbaApp.inspect().paused'))await c.click('#wb-pause');
 if(id==='pinball')await c.until('document.querySelector(".wb-cadet-frame")?.contentWindow?.cadetHost?.snapshot()?.ready',25000);
 await c.wait(600);
};
const begin=`(()=>{const frames=[window,...[...document.querySelectorAll('iframe')].map(f=>f.contentWindow)];
 window.__wanbaPerf=frames.map((win,index)=>{const state={index,start:win.performance.now(),intervals:[],timerDelay:[],longTasks:[],longTasksSupported:win.PerformanceObserver?.supportedEntryTypes?.includes('longtask')||false,done:false};let last,expected=win.performance.now()+50;
 const frame=now=>{if(state.done)return;if(last!=null)state.intervals.push(now-last);last=now;state.raf=win.requestAnimationFrame(frame)};state.raf=win.requestAnimationFrame(frame);
 state.timer=win.setInterval(()=>{const now=win.performance.now();state.timerDelay.push(Math.max(0,now-expected));expected=now+50},50);
 if(state.longTasksSupported){state.observer=new win.PerformanceObserver(list=>state.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));state.observer.observe({type:'longtask',buffered:false})}
 state.stop=()=>{state.done=true;win.cancelAnimationFrame(state.raf);win.clearInterval(state.timer);state.observer?.disconnect();return {index,durationMs:win.performance.now()-state.start,intervals:state.intervals,timerDelay:state.timerDelay,longTasksSupported:state.longTasksSupported,longTasks:state.longTasks}};return state;});return true})()`;
const layout=`(()=>{const frames=[{name:'main',win:window},...[...document.querySelectorAll('iframe')].map(f=>({name:'iframe',win:f.contentWindow}))];return {url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},canvases:frames.flatMap(({name,win})=>[...win.document.querySelectorAll('canvas')].map(e=>{const r=e.getBoundingClientRect();return {frame:name,id:e.id,width:e.width,height:e.height,cssWidth:r.width,cssHeight:r.height,art:e.dataset.gameArt||null}})),snapshot:document.querySelector('.wb-cadet-frame')?.contentWindow?.cadetHost?.snapshot()||null}})()`;
function summary(raw){const a=[...raw.intervals].sort((x,y)=>x-y),lag=[...raw.timerDelay].sort((x,y)=>x-y),pct=(arr,p)=>arr[Math.min(arr.length-1,Math.floor(arr.length*p))]??null;return {frame:raw.index,durationMs:raw.durationMs,frames:a.length,rafHz:a.length?1000/(a.reduce((n,x)=>n+x,0)/a.length):null,intervalMedian:pct(a,.5),intervalP95:pct(a,.95),intervalP99:pct(a,.99),intervalMax:a.at(-1),intervalsOver25ms:a.filter(x=>x>25).length,intervalsOver50ms:a.filter(x=>x>50).length,estimatedMissed60HzFrames:a.reduce((n,x)=>n+Math.max(0,Math.round(x/(1000/60))-1),0),timerDelayP95:pct(lag,.95),timerDelayMax:lag.at(-1),longTasksSupported:raw.longTasksSupported,longTaskCount:raw.longTasksSupported?raw.longTasks.length:null};}
try {
 if(process.env.PERF_PROFILE){
  for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab="settings"]');await c.until('!!document.querySelector("#wanba-performance")');
  await nativeSelectValue(c,'#wanba-performance',process.env.PERF_PROFILE);await c.until(`document.documentElement.dataset.wanbaPerformance===${JSON.stringify(process.env.PERF_PROFILE)}`);
 }
 for(const game of games){
  await open(game);const before=await c.evaluate(layout);screenshot(`${out}/${game}-before.png`);
  const display=adb('shell','dumpsys','display').split('\n').filter(s=>/DisplayDeviceInfo\{|mActiveModeId=|mActiveSfDisplayMode=/.test(s));
  await c.evaluate(begin);const actions=[],start=Date.now();
  while(Date.now()-start<duration){
   if(process.env.PERF_INPUT==='idle'){await c.wait(500);continue;}
   if(game==='paopao'){
    if(await c.evaluate('!!document.querySelector("#wb-next-round")')){await c.click('#wb-next-round');await c.wait(300);actions.push({action:'next-round',elapsedMs:Date.now()-start})}
    await touch('#wb-paopao-canvas',120,{x:[.2,.5,.8][actions.length%3],y:.35});actions.push({action:'aim-release',elapsedMs:Date.now()-start});await c.wait(2100);
   }
   if(game==='match3'){
    if(await c.evaluate('!!document.querySelector(".m3-next:not([hidden])")'))await c.click('.m3-next');
    await c.click('.m3-hint');const hints=await c.evaluate('[...document.querySelectorAll(".m3-cell.m3-suggest")].map(e=>[...e.parentElement.children].indexOf(e))');
    if(hints.length===2){await touch(`.m3-cell:nth-child(${hints[0]+1})`);await touch(`.m3-cell:nth-child(${hints[1]+1})`);actions.push('hinted-swap')}
    await c.wait(2100);
   }
   if(game==='pinball'){
    if(!actions.length){await touch('.cd-controls [data-action=launch]',3000);actions.push('charged-launch')}
    const coords=await c.evaluate('[...document.querySelectorAll(".cd-controls [data-action=left],.cd-controls [data-action=right]")].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})');
    await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:coords});await c.wait(160);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});actions.push('two-finger-flippers');await c.wait(700);
   }
   if(game==='jump'){
    if(await c.evaluate('!!document.querySelector("#wb-next-round")')){await c.click('#wb-next-round');await c.wait(300);actions.push('next-round')}
    const hold=await c.evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')||'{}').jump?.platforms||[{x:170,y:440},{x:330,y:275}];return Math.max(90,Math.min(880,(Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)-72)/230*32/.035))})()`);
    await touch('#wb-jump',hold);actions.push({action:'charge-release',holdMs:hold});await c.wait(1850);
   }
  }
  const raw=await c.evaluate('window.__wanbaPerf.map(s=>s.stop())'),after=await c.evaluate(layout);
  const result={game,before,after,actions,display,metrics:raw.map(summary),raw};results.push(result);writeFileSync(`${out}/${game}.json`,JSON.stringify(result,null,2));screenshot(`${out}/${game}-after.png`);console.log(JSON.stringify({game,actions:actions.length,metrics:result.metrics}));
 }
}catch(error){screenshot(`${out}/failure.png`);throw error}
finally {await c.evaluate('window.__wanbaPerf?.forEach(s=>s.stop());wanbaApp.pause();wanbaApp.save()').catch(()=>{});writeFileSync(`${out}/summary.json`,JSON.stringify({measuredAt:new Date().toISOString(),profile:process.env.PERF_PROFILE||'baseline',note:'Debug GeckoView real-touch workload; RAF cadence measures scheduling, not GPU presentation. Gecko long-task absence is reported unavailable, not zero.',results:results.map(({raw,...r})=>r)},null,2));await c.close()}
