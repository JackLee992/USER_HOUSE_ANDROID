// Real installed Android app regression for display-cutout immersive fullscreen.
// It opens representative fullscreen games and asserts their root fills the physical display,
// not only the WebView CSS viewport.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';

const out=process.env.QA_OUT||'docs/evidence/android-immersive-cutout/system';
const raw=process.env.QA_PRIVATE||'.local/qa-android-immersive-cutout/system';
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
function assertPhysicalFullscreen(view,label){
  const coverage=physicalCoverage(view,screenSize());
  assert.ok(coverage.missingLong<=36&&coverage.missingShort<=36,`${label} covers physical display; missing ${coverage.missingLong}x${coverage.missingShort}px`);
  return coverage;
}
async function until(fn,label,timeout=15000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){
    try{last=await fn();if(last)return last;}catch(error){last=String(error);}
    await c.wait(90);
  }
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
async function freshApp(){
  if(c){c.close();c=null;}
  adb('shell','am','force-stop',pkg);
  adb('shell','am','start','-n',activity);
  c=await connect();
  await c.evaluate('wanbaApp.openShellTab("single")');
  await until(()=>c.evaluate('!wanbaApp.inspect().game'),'catalog');
}
async function cleanProgress(id){
  await c.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',data=JSON.parse(localStorage.getItem(key)||'{}');delete data[${JSON.stringify(id)}];localStorage.setItem(key,JSON.stringify(data));return true})()`);
}
async function launchGame(game){
  await freshApp();
  await cleanProgress(game.id);
  const launched=await c.evaluate(`wanbaApp.launch(${JSON.stringify(game.id)},"single")`);
  assert.equal(launched.ok,true,game.id+' launch');
  await until(()=>c.evaluate('!!document.querySelector("#wb-start-cover-btn")'),game.id+' start cover');
  await touch(c,'#wb-start-cover-btn');
  if(game.modeSelector){
    await until(()=>c.evaluate(`!!document.querySelector(${JSON.stringify(game.modeSelector)})`),game.id+' mode picker');
    await touch(c,game.modeSelector);
  }
  await until(()=>c.evaluate(`!!document.querySelector(${JSON.stringify(game.rootSelector)})`),game.id+' fullscreen root');
  if(game.readyExpr)await until(()=>c.evaluate(game.readyExpr),game.id+' ready');
}
async function layout(game){
  return c.evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(game.rootSelector)});const r=root.getBoundingClientRect();const style=getComputedStyle(root);return {game:${JSON.stringify(game.id)},width:innerWidth,height:innerHeight,dpr:devicePixelRatio,orientation:screen.orientation?.type,visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft}:null,root:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},position:style.position,zIndex:style.zIndex,nativeImmersiveAvailable:typeof NativeBridge?.setGameImmersive==='function',bodyPadding:getComputedStyle(document.body).padding,htmlOverflow:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},state:wanbaApp.inspect().controller};})()`);
}
function assertCssFullscreen(view,label){
  assert.equal(view.position,'fixed',label+' root uses fixed positioning');
  assert.equal(view.nativeImmersiveAvailable,true,label+' native immersive bridge available');
  assert.ok(Math.abs(view.root.x)<2&&Math.abs(view.root.y)<2,label+' root starts at viewport origin');
  assert.ok(Math.abs(view.root.width-view.width)<2&&Math.abs(view.root.height-view.height)<2,label+' root fills CSS viewport');
}
async function checkGame(game,rotation,name,condition){
  adb('shell','wm','user-rotation','lock',rotation);
  await c.until(condition,12000);
  await c.wait(550);
  const view=await layout(game);
  assertCssFullscreen(view,`${game.id} ${name}`);
  const coverage=assertPhysicalFullscreen(view,`${game.id} ${name}`);
  screenshot(`${out}/${game.id}-${name}.png`);
  checks.push({check:'immersive fullscreen covers CSS viewport and physical display cutout area',game:game.id,rotation:Number(rotation),name,view,physicalCoverage:coverage});
}

const games=[
  {id:'zuma',rootSelector:'#wb-zuma-fullscreen',readyExpr:'wanbaApp.inspect().controller?.schema===2'},
  {id:'snake',rootSelector:'#wb-snake-fullscreen',modeSelector:'[data-snake-mode=endless]',readyExpr:'wanbaApp.inspect().started&&!wanbaApp.inspect().paused&&wanbaApp.inspect().controller?.fullscreen'},
  {id:'tetris',rootSelector:'#wb-tetris-fullscreen',modeSelector:'[data-tetris-mode=duel]',readyExpr:'wanbaApp.inspect().started&&!wanbaApp.inspect().paused&&wanbaApp.inspect().controller?.fullscreen'},
  {id:'freecell',rootSelector:'#wb-freecell-fullscreen',readyExpr:'wanbaApp.inspect().started&&!wanbaApp.inspect().paused'},
];

try{
  const originalRotation=rotationState();
  writeFileSync(`${raw}/rotation-restore.json`,JSON.stringify(originalRotation,null,2));
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','wm','user-rotation','lock','0');
  for(const game of games){
    await launchGame(game);
    await checkGame(game,'0','portrait','innerHeight>innerWidth');
    await checkGame(game,'1','landscape','innerWidth>innerHeight');
  }
  assert.deepEqual(c.errors,[]);
  console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){
  failed=String(error.stack||error);
  process.exitCode=1;
  writeFileSync(`${raw}/failure.txt`,failed);
  try{screenshot(`${raw}/failure.png`);}catch{}
  console.error(failed);
}finally{
  if(c){await c.evaluate('wanbaApp.pause();wanbaApp.save();true').catch(()=>{});c.close();}
  try{restoreRotation(JSON.parse(readFileSync(`${raw}/rotation-restore.json`,'utf8')));}catch{}
  writeFileSync(`${out}/android-immersive-cutout.json`,JSON.stringify({passed:!failed,testedAt:new Date().toISOString(),checks,error:failed},null,2));
}
