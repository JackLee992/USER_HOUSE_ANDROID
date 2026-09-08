import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {connect,screenshot,origin} from './android-driver.mjs';
const c=await connect(),out=process.env.QA_OUT||'docs/evidence/android-1.0';const results=[];
try{
 await c.send('Page.reload');await c.wait(600);await c.until('!!window.wanbaApp');
 for(let i=0;i<3;i++)await c.evaluate('wanbaApp.back()');
 const games=await c.evaluate('wanbaApp.inspect().games');assert.equal(games.length,37);
 for(const g of games.slice(Number(process.env.START_AT||0))){
  await c.click(`[data-tab="${g.mode}"]`);await c.click(`[data-game="${g.id}"]`);await c.wait(130);
  for(let n=0;n<25;n++){
   const current=await c.evaluate('({started:wanbaApp.inspect().started,first:!!document.querySelector("[data-first]"),choice:!!document.querySelector(".wb-choice-card"),progress:!!document.querySelector("#wb-progress-continue"),cover:!!document.querySelector("#wb-start-cover-btn"),text:document.body.innerText})');
   if(current.started)break;
   if(current.first)await c.click('[data-first="user"]');else if(current.progress)await c.click('#wb-progress-continue');else if(current.choice)await c.click('[data-choice],button.wb-choice-card');else if(current.cover)await c.click('#wb-start-cover-btn');
   else throw Error(g.id+' unknown start UI '+current.text);
   await c.wait(150);
  }
  const s=await c.evaluate('wanbaApp.inspect()');assert.equal(s.game,g.id);assert.equal(s.started,true,g.id+' started');
  if(g.id==='pinball')await c.until('document.querySelector(".wb-cadet-frame")?.contentWindow?.cadetHost?.snapshot()?.ready',25000);
  await c.wait(350);
  const layout=await c.evaluate('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,canvases:[...document.querySelectorAll("canvas")].map(e=>({width:e.width,height:e.height})),body:document.querySelector("#wb-game-area")?.innerText?.slice(0,120)})');
  assert.ok(layout.scrollWidth<=layout.width+1,g.id+' no document overflow');
  if(['paopao','pinball','match3','freecell'].includes(g.id))screenshot(`${out}/${g.id}-device.png`);
  await c.evaluate('wanbaApp.pause();wanbaApp.save()');assert.equal(await c.evaluate('wanbaApp.inspect().paused'),true);
  results.push({id:g.id,name:g.name,started:true,paused:true,layout});
  await c.evaluate('wanbaApp.back()');await c.wait(120);
  console.log('PASS '+g.id);
 }
 if(c.syncEvidence)await c.syncEvidence();assert.deepEqual(c.errors,[]);
 assert.equal(c.requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(origin+'/')).length,0);
 console.log(results.length+' games opened from real APK entry; no runtime exceptions or external requests.');
}catch(e){screenshot(`${out}/smoke-failure.png`);console.error(e);process.exitCode=1}
finally{writeFileSync(`${out}/games-smoke.json`,JSON.stringify({passed:process.exitCode!==1,results,errors:c.errors,requests:c.requests},null,2));c.close()}
