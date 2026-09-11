// Real installed Android app regression for FreeCell fullscreen and pause/rotation flow.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';

const out=process.env.QA_OUT||'docs/evidence/freecell-fullscreen-1.0.1/android';
const raw=process.env.QA_PRIVATE||'.local/qa-freecell-fullscreen-1.0.1/android';
mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const pkg=activity.split('/')[0],checks=[];
let c,failed=null;

function rotationState(){
  return {
    mode:adb('shell','wm','user-rotation').trim(),
    accelerometer:adb('shell','settings','get','system','accelerometer_rotation').trim(),
    rotation:adb('shell','settings','get','system','user_rotation').trim(),
  };
}
function restoreRotation(value){
  if(!value)return;
  if(value.mode==='free')adb('shell','wm','user-rotation','free');
  else if(/^lock [0-3]$/.test(value.mode))adb('shell','wm','user-rotation','lock',value.mode.split(' ')[1]);
  for(const [name,setting] of [['user_rotation',value.rotation],['accelerometer_rotation',value.accelerometer]]){
    if(setting==='null')adb('shell','settings','delete','system',name);
    else adb('shell','settings','put','system',name,setting);
  }
}
function screenSize(){
  const text=adb('shell','wm','size'),match=/Physical size:\s*(\d+)x(\d+)/.exec(text);
  if(!match)throw Error('Unable to read Android physical display size: '+text);
  return {width:Number(match[1]),height:Number(match[2])};
}
function physicalCoverage(view,display){
  const dpr=Number(view.dpr)||1;
  const cssWidth=Math.round(view.root.width*dpr),cssHeight=Math.round(view.root.height*dpr);
  const rootLong=Math.max(cssWidth,cssHeight),rootShort=Math.min(cssWidth,cssHeight);
  const displayLong=Math.max(display.width,display.height),displayShort=Math.min(display.width,display.height);
  return {display,cssWidth,cssHeight,missingLong:Math.max(0,displayLong-rootLong),missingShort:Math.max(0,displayShort-rootShort)};
}
function assertPhysicalFullscreen(view,display,label){
  const coverage=physicalCoverage(view,display);
  assert.ok(coverage.missingLong<=36&&coverage.missingShort<=36,`${label} covers physical display; missing ${coverage.missingLong}x${coverage.missingShort}px`);
  return coverage;
}
async function until(fn,label,timeout=15000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){
    try{last=await fn();if(last)return last;}catch(error){last=String(error);}
    await c.wait(80);
  }
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
const cleanFreeCellProgress=()=>c.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',data=JSON.parse(localStorage.getItem(key)||'{}');delete data.freecell;localStorage.setItem(key,JSON.stringify(data));return true})()`);
async function openFreeCell(){
  await c.evaluate('wanbaApp.openShellTab("single")');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'home');
  await cleanFreeCellProgress();
  const launch=await c.evaluate('wanbaApp.launch("freecell","single")');
  assert.equal(launch.ok,true);
  await until(()=>c.evaluate('!!document.querySelector("#wb-start-cover-btn")'),'freecell start cover');
  await touch(c,'#wb-start-cover-btn');
  await until(()=>c.evaluate('!!document.querySelector("#wb-freecell-fullscreen")&&wanbaApp.inspect().started&&!wanbaApp.inspect().paused'),'fullscreen freecell');
}
async function layout(){
  return c.evaluate(`(()=>{const root=document.querySelector('#wb-freecell-fullscreen'),top=document.querySelector('.fc-top'),columns=document.querySelector('.fc-columns'),tools=document.querySelector('.fc-tools'),pause=document.querySelector('[data-action=pause]'),mask=document.querySelector('[data-freecell-mask]');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const cards=[...root.querySelectorAll('.fc-card')].map(rect),slots=[...root.querySelectorAll('.fc-slot')].map(rect),buttons=[...root.querySelectorAll('button')].map(e=>({text:e.textContent.trim(),action:e.dataset.action||'',rect:rect(e)}));
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,orientation:screen.orientation?.type,version:root.dataset.gameVersion,root:rect(root),top:rect(top),columns:rect(columns),tools:rect(tools),pause:rect(pause),maskHidden:mask.hidden,position:getComputedStyle(root).position,zIndex:getComputedStyle(root).zIndex,overflow:document.documentElement.scrollWidth-innerWidth,nativeImmersiveAvailable:typeof NativeBridge?.setGameImmersive==='function',cards,slots,buttons,state:wanbaApp.inspect().controller};
  })()`);
}
function assertInViewport(view,rect,label){
  assert.ok(rect.width>0&&rect.height>0,`${label} has size`);
  assert.ok(rect.x>=-1&&rect.y>=-1&&rect.right<=view.width+1&&rect.bottom<=view.height+1,`${label} remains in viewport`);
}

try{
  const originalRotation=rotationState();
  writeFileSync(`${raw}/rotation-restore.json`,JSON.stringify(originalRotation,null,2));
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','wm','user-rotation','lock','0');
  adb('shell','am','force-stop',pkg);
  adb('shell','am','start','-n',activity);
  c=await connect();
  await openFreeCell();
  const display=screenSize(),first=await layout();
  const firstCoverage=assertPhysicalFullscreen(first,display,'portrait FreeCell');
  assert.equal(first.version,'1.0.1');
  assert.equal(first.position,'fixed');
  assert.equal(first.nativeImmersiveAvailable,true);
  assert.ok(Math.abs(first.root.x)<2&&Math.abs(first.root.y)<2,'fullscreen root starts at viewport origin');
  assert.ok(Math.abs(first.root.width-first.width)<2&&Math.abs(first.root.height-first.height)<2,'fullscreen root fills viewport');
  assert.ok(first.cards.length>=52,'all dealt cards are visible in the FreeCell surface');
  assert.ok(first.buttons.find(b=>b.action==='pause'&&b.rect.width>=44&&b.rect.height>=44),'pause has a phone-sized touch target');
  assert.ok(first.buttons.find(b=>b.action==='exit'&&b.rect.width>=44&&b.rect.height>=44),'exit has a phone-sized touch target');
  assert.ok(first.overflow<=1,'document does not horizontally overflow');
  for(const [label,rect] of [['top slots',first.top],['columns',first.columns],['tools',first.tools],['pause',first.pause]])assertInViewport(first,rect,label);
  screenshot(`${out}/freecell-portrait-fullscreen.png`);
  checks.push({check:'FreeCell launches from installed APK into fixed fullscreen immersive board',layout:first,physicalCoverage:firstCoverage});

  await touch(c,'[data-action=pause]');
  await until(()=>c.evaluate('wanbaApp.inspect().paused&&!!document.querySelector("[data-freecell-mask]:not([hidden])")'),'freecell pause dialog');
  const paused=await layout();
  assert.equal(paused.maskHidden,false);
  screenshot(`${out}/freecell-paused.png`);
  checks.push({check:'FreeCell pause uses in-game fullscreen overlay',layout:paused});

  const pausedState=JSON.stringify(paused.state);
  for(const [rotation,name,condition] of [['1','landscape','innerWidth>innerHeight'],['0','portrait-restored','innerHeight>innerWidth']]){
    adb('shell','wm','user-rotation','lock',rotation);
    await c.until(condition,12000);
    await c.wait(500);
    const rotated=await layout();
    const rotatedCoverage=assertPhysicalFullscreen(rotated,screenSize(),`${name} FreeCell`);
    assert.equal(JSON.stringify(rotated.state),pausedState,'paused FreeCell board state survives rotation');
    assert.ok(Math.abs(rotated.root.x)<2&&Math.abs(rotated.root.y)<2,'rotated fullscreen root starts at viewport origin');
    assert.ok(Math.abs(rotated.root.width-rotated.width)<2&&Math.abs(rotated.root.height-rotated.height)<2,'rotated fullscreen root fills viewport');
    for(const [label,rect] of [['top slots',rotated.top],['columns',rotated.columns],['tools',rotated.tools],['pause',rotated.pause]])assertInViewport(rotated,rect,`${name} ${label}`);
    screenshot(`${out}/freecell-${name}.png`);
    checks.push({check:'physical Android rotation keeps FreeCell fullscreen and paused state intact',rotation:Number(rotation),name,layout:rotated,physicalCoverage:rotatedCoverage});
  }

  await touch(c,'[data-action=resume]');
  await until(()=>c.evaluate('!wanbaApp.inspect().paused&&document.querySelector("[data-freecell-mask]").hidden'),'freecell resume');
  await touch(c,'.fc-head [data-action=exit]');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'exit to native catalog');
  checks.push('exit returns to native catalog without JS errors');
  assert.deepEqual(c.errors,[]);
  console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){
  failed=String(error.stack||error);
  process.exitCode=1;
  writeFileSync(`${raw}/failure.txt`,failed);
  try{screenshot(`${raw}/failure.png`);}catch{}
  console.error(failed);
}finally{
  if(c){
    await c.evaluate('wanbaApp.pause();wanbaApp.save();true').catch(()=>{});
    c.close();
  }
  try{restoreRotation(JSON.parse(readFileSync(`${raw}/rotation-restore.json`,'utf8')));}catch{}
  writeFileSync(`${out}/freecell-fullscreen.json`,JSON.stringify({passed:!failed,testedAt:new Date().toISOString(),checks,error:failed},null,2));
}
