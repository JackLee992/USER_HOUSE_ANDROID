// Real installed Android app regression for Tetris battle fullscreen and controls.
// WebView CDP is used for inspection; gameplay controls are driven by ADB input.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';

const out=process.env.QA_OUT||'docs/evidence/tetris-battle-1.1.2/android';
const raw=process.env.QA_PRIVATE||'.local/qa-tetris-battle-1.1.2/android';
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
function cssToScreen(point,view,screen){
  const sx=screen.width/view.width;
  const dpr=Number(view.dpr);
  const sy=Number.isFinite(dpr)&&Math.abs(view.width*dpr-screen.width)<screen.width*.08?dpr:screen.height/view.height;
  const topInset=Math.max(0,screen.height-view.height*sy);
  return {x:Math.round(point.x*sx),y:Math.round(point.y*sy+topInset)};
}
function center(rect){return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};}
async function until(fn,label,timeout=15000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){
    try{last=await fn();if(last)return last;}catch(error){last=String(error);}
    await c.wait(80);
  }
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
const state=()=>c.evaluate('wanbaApp.inspect().controller');
const cleanTetrisProgress=()=>c.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',data=JSON.parse(localStorage.getItem(key)||'{}');delete data.tetris;localStorage.setItem(key,JSON.stringify(data));return true})()`);
async function openTetris(){
  await c.evaluate('wanbaApp.openShellTab("single")');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'home');
  await cleanTetrisProgress();
  const launch=await c.evaluate('wanbaApp.launch("tetris","single")');
  assert.equal(launch.ok,true);
  await until(()=>c.evaluate('!!document.querySelector("#wb-start-cover-btn")'),'tetris start cover');
  await touch(c,'#wb-start-cover-btn');
  await until(()=>c.evaluate('!!document.querySelector("[data-tetris-mode=duel]")'),'tetris mode picker');
  await touch(c,'[data-tetris-mode=duel]');
  await until(()=>c.evaluate('!!document.querySelector("#wb-tetris-fullscreen")&&wanbaApp.inspect().controller?.fullscreen'),'fullscreen battle');
  await until(()=>c.evaluate('wanbaApp.inspect().started&&!wanbaApp.inspect().paused'),'battle playing');
}
async function layout(){
  return c.evaluate(`(()=>{const root=document.querySelector('#wb-tetris-fullscreen'),stage=document.querySelector('.tb-stage'),controls=document.querySelector('.tb-controls'),pause=document.querySelector('[data-tetris-pause]'),mask=document.querySelector('[data-tetris-mask]');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const buttons=Object.fromEntries([...root.querySelectorAll('[data-tetris-action]')].map(e=>[e.dataset.tetrisAction,rect(e)]));
    const dpad=rect(root.querySelector('[data-tetris-dpad]')),actions=rect(root.querySelector('.tb-action-pad'));
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,orientation:screen.orientation?.type,root:rect(root),stage:rect(stage),controls:rect(controls),dpad,actions,pause:rect(pause),maskHidden:mask.hidden,buttons,canvases:[...root.querySelectorAll('canvas')].filter(e=>!e.hidden).map(rect),position:getComputedStyle(root).position,zIndex:getComputedStyle(root).zIndex,overflow:document.documentElement.scrollWidth-innerWidth,nativeImmersiveAvailable:typeof NativeBridge?.setGameImmersive==='function',nativeHapticAvailable:typeof NativeBridge?.performHapticFeedback==='function',state:wanbaApp.inspect().controller};
  })()`);
}
async function adbTap(rect,view,display){
  const p=cssToScreen(center(rect),view,display);
  await adbAsync('shell','input','tap',String(p.x),String(p.y));
  return p;
}
function dpadTarget(view,direction){
  const offsets={left:[1/6,.5],right:[5/6,.5],rotate:[.5,1/6],soft:[.5,5/6]}[direction];
  return cssToScreen({x:view.dpad.x+view.dpad.width*offsets[0],y:view.dpad.y+view.dpad.height*offsets[1]},view,screenSize());
}
const gameplay=sample=>({mode:sample.mode,ticks:sample.ticks,score:sample.score,lines:sample.lines,locks:sample.locks,current:sample.current,holdUsed:sample.holdUsed,pending:sample.pending,ended:sample.ended,paused:sample.paused});

try{
  const originalRotation=rotationState();
  writeFileSync(`${raw}/rotation-restore.json`,JSON.stringify(originalRotation,null,2));
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','wm','user-rotation','lock','0');
  adb('shell','am','force-stop',pkg);
  adb('shell','am','start','-n',activity);
  c=await connect();
  await openTetris();
  const display=screenSize(),first=await layout();
  const firstCoverage=assertPhysicalFullscreen(first,display,'portrait Tetris');
  assert.equal(first.state.mode,'duel');
  assert.equal(first.state.fullscreen,true);
  assert.equal(first.position,'fixed');
  assert.equal(first.nativeImmersiveAvailable,true);
  assert.equal(first.nativeHapticAvailable,true);
  assert.ok(Math.abs(first.root.x)<2&&Math.abs(first.root.y)<2,'fullscreen root starts at viewport origin');
  assert.ok(Math.abs(first.root.width-first.width)<2&&Math.abs(first.root.height-first.height)<2,'fullscreen root fills viewport');
  assert.ok(first.buttons.hard.width>=48&&first.buttons.hard.height>=48,'hard drop has phone-sized touch target');
  assert.ok(first.dpad.width>=140&&first.dpad.height>=140,'classic D-pad has a comfortable thumb area');
  for(const action of ['left','right','rotate','soft'])assert.ok(first.buttons[action].width>=44&&first.buttons[action].height>=44,action+' D-pad target is large enough');
  assert.ok(first.canvases.length>=3,'main, previews and opponent canvases are visible');
  for(const rect of [first.stage,first.controls,first.dpad,first.actions,first.pause,...Object.values(first.buttons),...first.canvases]){
    assert.ok(rect.width>0&&rect.height>0&&rect.x>=-1&&rect.y>=-1&&rect.right<=first.width+1&&rect.bottom<=first.height+1,'portrait Tetris controls remain in viewport');
  }
  screenshot(`${out}/tetris-portrait-fullscreen.png`);
  checks.push({check:'Tetris duel launches from installed APK into fixed fullscreen immersive arena',layout:first,physicalCoverage:firstCoverage});

  const beforeHard=await state();
  const hardPoint=await adbTap(first.buttons.hard,first,display);
  const afterHard=await until(()=>state().then(s=>s.locks>beforeHard.locks&&s),'hard drop by ADB tap');
  assert.ok(afterHard.score>=beforeHard.score,'hard drop keeps or improves score');
  screenshot(`${out}/tetris-after-hard-drop.png`);
  checks.push({check:'OS-level ADB tap hard-drops the current piece once',before:gameplay(beforeHard),after:gameplay(afterHard),adb:{hardPoint,display}});

  const beforeHold=await state();
  const rightCenter=dpadTarget(first,'right');
  const hold=adbAsync('shell','input','swipe',String(rightCenter.x),String(rightCenter.y),String(rightCenter.x),String(rightCenter.y),'650');
  let moved=false,movedSample=null;
  const moveDeadline=Date.now()+700;
  while(Date.now()<moveDeadline){
    movedSample=await state();
    if(movedSample.current.x>beforeHold.current.x){moved=true;break;}
    await c.wait(45);
  }
  await hold;
  assert.equal(moved,true,'ADB long press right must repeat movement while held');
  screenshot(`${out}/tetris-after-right-hold.png`);
  checks.push({check:'OS-level ADB long-press on classic D-pad repeats right movement',before:gameplay(beforeHold),sample:gameplay(movedSample),adb:{rightCenter,display}});

  const pauseLayout=await layout();
  const pausedTap=await adbTap(pauseLayout.pause,pauseLayout,screenSize());
  await until(()=>c.evaluate('wanbaApp.inspect().controller.paused&&!document.querySelector("[data-tetris-mask]").hidden'),'pause dialog');
  const paused=await state();
  await c.wait(600);
  assert.deepEqual(await state(),paused,'paused Tetris state remains frozen');
  screenshot(`${out}/tetris-paused.png`);
  checks.push({check:'fullscreen pause uses in-game overlay and freezes controller state',paused:gameplay(paused),adb:{pausedTap}});

  const pausedGameplay=gameplay(paused);
  for(const [rotation,name,condition] of [['1','landscape','innerWidth>innerHeight'],['0','portrait-restored','innerHeight>innerWidth']]){
    adb('shell','wm','user-rotation','lock',rotation);
    await c.until(condition,12000);
    await c.wait(500);
    const rotated=await layout(),sample=await state();
    const rotatedCoverage=assertPhysicalFullscreen(rotated,screenSize(),`${name} Tetris`);
    assert.equal(sample.paused,true,'rotation keeps Tetris paused');
    assert.deepEqual(gameplay(sample),pausedGameplay,'paused gameplay identity is preserved across physical rotation');
    assert.ok(Math.abs(rotated.root.x)<2&&Math.abs(rotated.root.y)<2,'rotated fullscreen root starts at viewport origin');
    assert.ok(Math.abs(rotated.root.width-rotated.width)<2&&Math.abs(rotated.root.height-rotated.height)<2,'rotated fullscreen root fills viewport');
    for(const rect of [rotated.stage,rotated.controls,rotated.dpad,rotated.actions,rotated.pause,...Object.values(rotated.buttons),...rotated.canvases]){
      assert.ok(rect.width>0&&rect.height>0&&rect.x>=-1&&rect.y>=-1&&rect.right<=rotated.width+1&&rect.bottom<=rotated.height+1,'rotated Tetris controls remain in viewport');
    }
    screenshot(`${out}/tetris-${name}.png`);
    checks.push({check:'physical Android rotation keeps Tetris fullscreen and paused state intact',rotation:Number(rotation),name,layout:rotated,physicalCoverage:rotatedCoverage,gameplay:pausedGameplay});
  }

  await touch(c,'[data-tetris-resume]');
  await until(()=>c.evaluate('!wanbaApp.inspect().controller.paused'),'resume');
  await touch(c,'[data-tetris-exit]');
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
  writeFileSync(`${out}/tetris-battle.json`,JSON.stringify({passed:!failed,testedAt:new Date().toISOString(),checks,error:failed},null,2));
}
