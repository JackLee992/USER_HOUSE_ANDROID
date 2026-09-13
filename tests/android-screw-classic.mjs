// Installed Android regression for the Screw game preserved from our fork baseline.
// Launch/setup state is inspected through CDP; every visible control and screw
// interaction uses Android shell input against the real system WebView.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';

const out=process.env.QA_OUT||'docs/evidence/screw-classic-1.0.1/android-emulator';
mkdirSync(out,{recursive:true});
const packageName=activity.split('/')[0],checks=[];
let client,inputOffsetY=0,failure=null;

function statusBarOffset(){
  const match=/type=statusBars frame=\[0,0\]\[\d+,(\d+)\] visible=true/.exec(adb('shell','dumpsys','window'));
  return match?Number(match[1]):0;
}
async function until(fn,label,timeout=12000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){try{last=await fn();if(last)return last;}catch(error){last=String(error);}await client.wait(80);}
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
async function adbTap(selector){
  const point=await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,dpr:devicePixelRatio}})()`);
  adb('shell','input','tap',String(Math.round(point.x*point.dpr)),String(Math.round(point.y*point.dpr+inputOffsetY)));
  await client.wait(180);
}
async function clearClassic(){
  await client.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',all=JSON.parse(localStorage.getItem(key)||'{}');delete all.screwclassic;localStorage.setItem(key,JSON.stringify(all));return true})()`);
}
async function stored(){
  return client.evaluate(`JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')||'{}').screwclassic||null`);
}
async function openClassic(choice){
  await client.evaluate('wanbaApp.openShellTab("single")');
  const launch=await client.evaluate('wanbaApp.launch("screwclassic","single")');
  assert.equal(launch.ok,true);
  for(let attempt=0;attempt<60;attempt++){
    if(await client.evaluate('wanbaApp.inspect().started'))return;
    const selector=await client.evaluate(`(()=>{if(document.querySelector('[data-choice="${choice}"]'))return '[data-choice="${choice}"]';if(document.querySelector('#wb-start-cover-btn'))return '#wb-start-cover-btn';if(document.querySelector('#wb-progress-new'))return '#wb-progress-new';return null})()`);
    if(selector)await adbTap(selector);else await client.wait(100);
  }
  throw Error('Classic Screw did not start');
}
async function topScrewPoint(){
  return client.evaluate(`(()=>{const state=JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')||'{}').screwclassic,
    panel=state.panels.filter(item=>!item.gone&&!item.falling).sort((a,b)=>b.z-a.z)[0],screw=panel.screws.find(item=>!item.gone),
    ca=Math.cos(panel.a||0),sa=Math.sin(panel.a||0),world=screw.anchor||{x:panel.x+screw.lx*ca-screw.ly*sa,y:panel.y+screw.lx*sa+screw.ly*ca},
    r=document.querySelector('#wb-screw-canvas').getBoundingClientRect();return{id:screw.id,x:r.x+world.x/420*r.width,y:r.y+world.y/560*r.height,dpr:devicePixelRatio};})()`);
}
async function tapPoint(point){
  adb('shell','input','tap',String(Math.round(point.x*point.dpr)),String(Math.round(point.y*point.dpr+inputOffsetY)));
  await client.wait(220);
}

try{
  adb('shell','am','force-stop',packageName);adb('shell','am','start','-n',activity);
  client=await connect();inputOffsetY=statusBarOffset();
  await client.evaluate('wanbaApp.setLocale("zh-CN")');
  for(let attempt=0;attempt<6&&await client.evaluate('!!wanbaApp.inspect().game');attempt++){
    await client.evaluate('wanbaApp.back();true');await client.wait(100);
  }
  await until(()=>client.evaluate('!wanbaApp.inspect().game'),'catalog');
  await client.evaluate('wanbaApp.openShellTab("single")');
  const catalog=await client.evaluate(`(()=>({names:[...document.querySelectorAll('[data-game="screwclassic"],[data-game="screw"]')].map(e=>e.textContent),classic:!!document.querySelector('[data-game="screwclassic"]'),crazy:!!document.querySelector('[data-game="screw"]')}))()`);
  assert.equal(catalog.classic,true);assert.equal(catalog.crazy,true);
  await client.evaluate(`document.querySelector('[data-game="screwclassic"]').scrollIntoView({block:'center'});true`);await client.wait(350);
  screenshot(`${out}/dual-catalog.png`);

  await clearClassic();await openClassic('normal');
  let state=await until(stored,'normal save');
  assert.equal(state.choice,'normal');assert.ok(state.panels.length>=42&&state.panels.length<=47);
  const normalLayout=await client.evaluate(`(()=>{const r=e=>{const x=e.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height,right:x.right,bottom:x.bottom}};return{canvas:r(document.querySelector('#wb-screw-canvas')),gamebox:r(document.querySelector('#wb-gamebox')),boxes:document.querySelectorAll('.wb-screw-box').length,slots:document.querySelectorAll('.wb-screw-slot').length,overflow:document.documentElement.scrollWidth-innerWidth}})()`);
  assert.equal(normalLayout.boxes,3);assert.equal(normalLayout.slots,5);assert.ok(normalLayout.overflow<=1);
  const screw=await topScrewPoint();await tapPoint(screw);
  state=await until(async()=>{const next=await stored();return next?.details?.removed===1&&next;},'normal screw move');
  screenshot(`${out}/normal-after-touch.png`);
  checks.push({check:'original normal board starts and accepts Android touch',panels:state.panels.length,screw:screw.id,layout:normalLayout});

  await client.evaluate('wanbaApp.back();true');await clearClassic();await openClassic('endless');
  state=await until(stored,'endless save');
  assert.equal(state.choice,'endless');assert.ok(state.panels.length>=28&&state.panels.length<=32);assert.equal(state.details.endlessLayers,1);
  screenshot(`${out}/endless-original.png`);
  checks.push({check:'original endless mode restores its fork-baseline board and continuous-layer state',panels:state.panels.length,layers:state.details.endlessLayers});
  assert.deepEqual(client.errors,[]);
  console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){
  failure=String(error.stack||error);process.exitCode=1;try{screenshot(`${out}/failure.png`);}catch{}console.error(failure);
}finally{
  writeFileSync(`${out}/result.json`,JSON.stringify({passed:!failure,testedAt:new Date().toISOString(),device:process.env.ADB_SERIAL||'emulator-5554',input:'Android shell input tap; CDP read-only inspection',checks,error:failure},null,2)+'\n');
  client?.close();
}
