// Real installed Android app regression for Snake arena fullscreen and touch controls.
// Uses the emulator WebView only for inspection; joystick and boost are driven by ADB input.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';

const out=process.env.QA_OUT||'docs/evidence/snake-arena-1.2.0/emulator';
const raw=process.env.QA_PRIVATE||'.local/qa-snake-arena-1.2.0/emulator';
const adbPath=process.env.ADB||'/Users/jacklee/Library/Android/sdk/platform-tools/adb';
const serial=process.env.ADB_SERIAL||'emulator-5554';
mkdirSync(out,{recursive:true});mkdirSync(raw,{recursive:true});
const pkg=activity.split('/')[0],checks=[];
let c,failed=null;

function adbAsync(...args){
  return new Promise((resolve,reject)=>{
    const child=spawn(adbPath,['-s',serial,...args],{stdio:['ignore','pipe','pipe']});
    let stderr='';
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',reject);
    child.on('close',code=>code===0?resolve():reject(Error(stderr.trim()||`adb ${args.join(' ')} exited ${code}`)));
  });
}
async function until(fn,label,timeout=15000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){
    try{last=await fn();if(last)return last;}catch(error){last=String(error);}
    await c.wait(80);
  }
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
const state=()=>c.evaluate('wanbaApp.inspect().controller');
const cleanSnakeProgress=()=>c.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',data=JSON.parse(localStorage.getItem(key)||'{}');delete data.snake;localStorage.setItem(key,JSON.stringify(data));return true})()`);
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
  if(!match)throw Error('Unable to read emulator physical display size: '+text);
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
function cssToScreen(point,view,screen){
  return {
    x:Math.round(point.x*screen.width/view.width),
    y:Math.round(point.y*screen.height/view.height),
  };
}
async function openSnake(){
  await c.evaluate('wanbaApp.openShellTab("single")');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'home');
  await cleanSnakeProgress();
  const launch=await c.evaluate('wanbaApp.launch("snake","single")');
  assert.equal(launch.ok,true);
  await until(()=>c.evaluate('!!document.querySelector("#wb-start-cover-btn")'),'snake start cover');
  await touch(c,'#wb-start-cover-btn');
  await until(()=>c.evaluate('!!document.querySelector("[data-snake-mode=endless]")'),'snake mode picker');
  await touch(c,'[data-snake-mode=endless]');
  await until(()=>c.evaluate('!!document.querySelector("#wb-snake-fullscreen")&&wanbaApp.inspect().controller?.fullscreen'),'fullscreen arena');
  await until(()=>c.evaluate('wanbaApp.inspect().started&&!wanbaApp.inspect().paused'),'arena playing');
}
async function layout(){
  return c.evaluate(`(()=>{const root=document.querySelector('#wb-snake-fullscreen'),canvas=document.querySelector('.snake-arena-canvas'),boost=document.querySelector('[data-arena-boost]'),zone=document.querySelector('[data-arena-stickzone]'),pause=document.querySelector('[data-arena-pause]');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop}:null,root:rect(root),canvas:rect(canvas),boost:rect(boost),zone:rect(zone),pause:rect(pause),position:getComputedStyle(root).position,zIndex:getComputedStyle(root).zIndex,overflow:document.documentElement.scrollWidth-innerWidth,nativeImmersiveAvailable:typeof NativeBridge?.setGameImmersive==='function',state:wanbaApp.inspect().controller};
  })()`);
}
function center(rect){return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};}
async function quickTouch(selector){const point=await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Missing/disabled control');const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const gameplay=sample=>({mode:sample.mode,elapsed:sample.elapsed,remaining:sample.remaining,length:sample.length,best:sample.best,eaten:sample.eaten,boost:sample.boost,alive:sample.alive,ended:sample.ended,joystick:sample.joystick,paused:sample.paused,head:sample.head});

try{
  const originalRotation=rotationState();
  writeFileSync(`${raw}/rotation-restore.json`,JSON.stringify(originalRotation,null,2));
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','wm','user-rotation','lock','0');
  adb('shell','am','force-stop',pkg);
  adb('shell','am','start','-n',activity);
  c=await connect();
  await openSnake();
  const display=screenSize(),first=await layout();
  const firstCoverage=assertPhysicalFullscreen(first,display,'portrait Snake');
  assert.equal(first.state.mode,'endless');
  assert.equal(first.state.fullscreen,true);
  assert.equal(first.position,'fixed');
  assert.equal(first.nativeImmersiveAvailable,true);
  assert.ok(Math.abs(first.root.x)<2&&Math.abs(first.root.y)<2,'fullscreen root starts at viewport origin');
  assert.ok(Math.abs(first.root.width-first.width)<2&&Math.abs(first.root.height-first.height)<2,'fullscreen root fills viewport');
  assert.ok(Math.abs(first.canvas.width-first.root.width)<2&&Math.abs(first.canvas.height-first.root.height)<2,'canvas fills fullscreen root');
  assert.ok(first.boost.width>=80&&first.boost.height>=80,'boost has phone-sized touch target');
  assert.ok(first.zone.width>first.width*.6&&first.zone.height>first.height-2,'joystick zone covers the left play surface');
  assert.ok(first.overflow<=1,'document does not horizontally overflow');
  const afterGrowth=await until(async()=>{const sample=await state();return sample.eaten>=5?sample:false;},'opening food creates visible growth',1800);
  assert.ok(afterGrowth.length>=300,`five opening pellets must visibly lengthen the snake from 170 to at least 300, got ${afterGrowth.length}`);
  checks.push({check:'Snake launches from installed APK into fixed fullscreen immersive arena',layout:first,physicalCoverage:firstCoverage});
  checks.push({check:'opening food lane visibly lengthens the player without boost',before:{length:170,eaten:0},after:{length:afterGrowth.length,eaten:afterGrowth.eaten}});

  const boostPoint=center(first.boost),beforeBoost=await state();
  const boostScreen=cssToScreen(boostPoint,first,display);
  const boost=adbAsync('shell','input','swipe',String(boostScreen.x),String(boostScreen.y),String(boostScreen.x),String(boostScreen.y),'900');
  let boostSeen=false,boostSample=null;
  const boostDeadline=Date.now()+950;
  while(Date.now()<boostDeadline){
    boostSample=await state();
    if(boostSample.boost){boostSeen=true;break;}
    await c.wait(45);
  }
  await boost;
  await c.wait(180);
  const afterBoost=await state(),travel=distance(beforeBoost.head,afterBoost.head),elapsed=afterBoost.elapsed-beforeBoost.elapsed,worldSpeed=travel/Math.max(.001,elapsed);
  assert.equal(boostSeen,true,'ADB long-press must engage boost while held');
  assert.equal(afterBoost.boost,false,'boost releases after touch end');
  assert.ok(worldSpeed>280,`boost movement should be visibly faster than cruise speed, got ${worldSpeed.toFixed(1)}`);
  screenshot(`${out}/snake-after-adb-boost.png`);
  checks.push({check:'OS-level ADB long-press engages and releases boost with faster travel',before:beforeBoost.head,after:afterBoost.head,elapsed,worldSpeed,heldSample:boostSample,adb:{css:boostPoint,screen:boostScreen,display}});

  const beforeDrag=await state();
  const startCss={x:Math.round(Math.max(72,first.zone.x+92)),y:Math.round(first.root.height-124)};
  const endCss={x:Math.max(28,startCss.x-64),y:Math.max(92,startCss.y-126)};
  const start=cssToScreen(startCss,first,display),end=cssToScreen(endCss,first,display);
  const drag=adbAsync('shell','input','swipe',String(start.x),String(start.y),String(end.x),String(end.y),'520');
  let steeringSeen=false,dragSample=null;
  const dragDeadline=Date.now()+620;
  while(Date.now()<dragDeadline){
    dragSample=await state();
    if(Number.isFinite(dragSample.steering)||Math.abs(dragSample.head.angle-beforeDrag.head.angle)>.08){steeringSeen=true;break;}
    await c.wait(55);
  }
  await drag;
  await c.wait(150);
  const afterDrag=await state();
  assert.equal(steeringSeen,true,'ADB drag must be observed by the arena joystick');
  assert.ok(Math.abs(afterDrag.head.angle-beforeDrag.head.angle)>.12,'real drag changes player heading');
  checks.push({check:'OS-level ADB drag reaches WebView joystick and changes heading quickly',from:beforeDrag.head,to:afterDrag.head,sample:dragSample,adb:{css:{start:startCss,end:endCss},screen:{start,end},display}});

  if((await state()).ended)await openSnake();

  await quickTouch('[data-arena-pause]');
  await until(()=>c.evaluate('wanbaApp.inspect().controller.paused&&!document.querySelector("[data-arena-pause-mask]").hidden'),'pause dialog');
  const paused=await state();
  await c.wait(600);
  assert.deepEqual(await state(),paused,'paused arena state remains frozen');
  await c.evaluate('document.querySelector("[data-arena-pause-mask]").hidden=true');
  screenshot(`${out}/snake-after-adb-drag.png`);
  copyFileSync(`${out}/snake-after-adb-drag.png`,`${out}/snake-portrait-fullscreen.png`);
  await c.evaluate('document.querySelector("[data-arena-pause-mask]").hidden=false');
  screenshot(`${out}/snake-paused.png`);
  checks.push({check:'fullscreen pause uses in-game overlay and freezes controller state',paused});

  const pausedGameplay=gameplay(paused);
  for(const [rotation,name,condition] of [['1','landscape','innerWidth>innerHeight'],['0','portrait-restored','innerHeight>innerWidth']]){
    adb('shell','wm','user-rotation','lock',rotation);
    await c.until(condition,12000);
    await c.wait(500);
    const rotated=await layout(),sample=await state();
    const rotatedCoverage=assertPhysicalFullscreen(rotated,screenSize(),`${name} Snake`);
    assert.equal(sample.paused,true,'rotation keeps the arena paused');
    assert.deepEqual(gameplay(sample),pausedGameplay,'paused gameplay identity is preserved across physical rotation');
    assert.ok(Math.abs(rotated.root.x)<2&&Math.abs(rotated.root.y)<2,'rotated fullscreen root starts at viewport origin');
    assert.ok(Math.abs(rotated.root.width-rotated.width)<2&&Math.abs(rotated.root.height-rotated.height)<2,'rotated fullscreen root fills viewport');
    for(const rect of [rotated.canvas,rotated.boost,rotated.zone,rotated.pause]){
      assert.ok(rect.width>0&&rect.height>0&&rect.x>=-1&&rect.y>=-1&&rect.right<=rotated.width+1&&rect.bottom<=rotated.height+1,'rotated controls remain inside viewport');
    }
    screenshot(`${out}/snake-${name}.png`);
    checks.push({check:'physical Android rotation keeps Snake fullscreen and paused state intact',rotation:Number(rotation),name,layout:rotated,physicalCoverage:rotatedCoverage,gameplay:pausedGameplay});
  }

  await quickTouch('[data-arena-resume]');
  await c.wait(20);
  assert.equal((await state()).paused,false,'resume touch returns the arena to active play');
  await quickTouch('[data-arena-exit]');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'exit to native catalog');
  checks.push('exit returns to catalog without JS errors');
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
  writeFileSync(`${out}/snake-arena.json`,JSON.stringify({passed:!failed,testedAt:new Date().toISOString(),checks,error:failed},null,2));
}
