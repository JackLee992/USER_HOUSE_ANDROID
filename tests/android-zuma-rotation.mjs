// User-authorized reversible Android display rotation, not CDP viewport emulation.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot} from './android-driver.mjs';
import {touch} from './android-native-select.mjs';
if(process.env.WANBA_ENGINE==='compat'&&!process.env.ADB_SERIAL)throw Error('Explicit phone serial required');
const out=process.env.QA_OUT||'docs/evidence/zuma-classic-v2/rotation';mkdirSync(out,{recursive:true});
const raw=process.env.QA_PRIVATE||'.local/qa-zuma-classic-v2/rotation';mkdirSync(raw,{recursive:true});
const original={mode:adb('shell','wm','user-rotation').trim(),accelerometer:adb('shell','settings','get','system','accelerometer_rotation').trim(),rotation:adb('shell','settings','get','system','user_rotation').trim()};
writeFileSync(raw+'/restore.json',JSON.stringify(original,null,2));
const c=await connect(),checks=[];let failure=null;
function screenSize(){const text=adb('shell','wm','size'),match=/Physical size:\s*(\d+)x(\d+)/.exec(text);if(!match)throw Error('Unable to read Android physical display size: '+text);return{width:Number(match[1]),height:Number(match[2])};}
function physicalCoverage(l,display){const dpr=Number(l.dpr)||1;const cssWidth=Math.round(l.portal.width*dpr),cssHeight=Math.round(l.portal.height*dpr);const rootLong=Math.max(cssWidth,cssHeight),rootShort=Math.min(cssWidth,cssHeight);const displayLong=Math.max(display.width,display.height),displayShort=Math.min(display.width,display.height);return{display,cssWidth,cssHeight,missingLong:Math.max(0,displayLong-rootLong),missingShort:Math.max(0,displayShort-rootShort)};}
function assertPhysicalFullscreen(l,display,label){const coverage=physicalCoverage(l,display);assert(coverage.missingLong<=36&&coverage.missingShort<=36,`${label} covers physical display; missing ${coverage.missingLong}x${coverage.missingShort}px`);return coverage;}
const core=()=>c.evaluate('(()=>{const s=wanbaApp.inspect().controller;return {schema:s.schema,score:s.score,levelScore:s.levelScore,lives:s.lives,levelIndex:s.levelIndex,status:s.status,details:s.details,current:s.current,next:s.next,chain:s.chain.map(b=>({id:b.id,color:b.color,powerup:b.powerup||null})),effects:s.effects,elapsed:s.elapsed,rng:s.rng,shotSeq:s.shotSeq,shot:s.shot?{id:s.shot.id,color:s.shot.color}:null}})()');
const layout=()=>c.evaluate('(()=>{const p=document.querySelector("#wb-zuma-fullscreen");return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,orientation:screen.orientation?.type,view:wanbaApp.inspect().controller.view,portal:p.getBoundingClientRect().toJSON(),controls:[...p.querySelectorAll(".zc-head,.zc-footer,.zc-canvas")].map(e=>e.getBoundingClientRect().toJSON())}})()');
try {
 let help;try{help=adb('shell','wm','help')}catch(error){if(error.status!==255||!error.stdout)throw error;help=String(error.stdout)}
 assert.match(help,/user-rotation/);assert(await c.evaluate('!!document.querySelector("#wb-zuma-fullscreen")'),'Open actual Zuma before rotating');
 if(!await c.evaluate('wanbaApp.inspect().controller.view.paused'))await touch(c,'#wb-zuma-pause');await c.wait(150);const before=await core();
 for(const [rotation,name]of[['0','portrait'],['1','landscape'],['0','portrait-restored']]){
  adb('shell','wm','user-rotation','lock',rotation);await c.until(rotation==='1'?'innerWidth>innerHeight':'innerHeight>innerWidth',12000);await c.wait(500);
  const l=await layout(),coverage=assertPhysicalFullscreen(l,screenSize(),`${name} Zuma`);assert.equal(l.view.layout,rotation==='1'?'landscape':'portrait');assert(l.view.paused);assert.deepEqual(await core(),before,'paused gameplay identity preserved across physical rotation');
  for(const r of l.controls)assert(r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=l.width+1&&r.bottom<=l.height+1,'rotated controls stay within available viewport');
  screenshot(`${out}/${name}.png`);checks.push({rotation:Number(rotation),name,layout:l,physicalCoverage:coverage,score:before.score,lives:before.lives,shots:before.details.shots,chainCount:before.chain.length});
 }
}catch(error){failure=String(error.stack||error);process.exitCode=1;try{screenshot(raw+'/failure.png')}catch{}console.error(error)}
finally{
 if(original.mode==='free')adb('shell','wm','user-rotation','free');else if(/^lock [0-3]$/.test(original.mode))adb('shell','wm','user-rotation','lock',original.mode.split(' ')[1]);
 for(const[name,value]of[['user_rotation',original.rotation],['accelerometer_rotation',original.accelerometer]]){if(value==='null')adb('shell','settings','delete','system',name);else adb('shell','settings','put','system',name,value);}
 const restored={mode:adb('shell','wm','user-rotation').trim(),accelerometer:adb('shell','settings','get','system','accelerometer_rotation').trim(),rotation:adb('shell','settings','get','system','user_rotation').trim()};
 if(restored.mode!==original.mode||restored.accelerometer!==original.accelerometer||restored.rotation!==original.rotation){failure=failure||'Android rotation settings not restored';process.exitCode=1;}
 writeFileSync(out+'/rotation.json',JSON.stringify({passed:!failure,testedAt:new Date().toISOString(),input:'adb physical-display rotation, not handheld or CDP emulation',original,restored,checks,error:failure},null,2));await c.close();
}
