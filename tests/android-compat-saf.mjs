import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-gecko.mjs';

const out=process.env.QA_OUT||'docs/evidence/android-1.1/compat-phone';mkdirSync(out,{recursive:true});
const rawOut='.local/qa-v1.1.0/saf-native';mkdirSync(rawOut,{recursive:true});
const checks=[],state={};
adb('shell','am','start','--activity-reorder-to-front','-n',activity);
const c=await connect();
const nodes=()=>{
 adb('shell','uiautomator','dump','--compressed','/sdcard/wanba-qa-window.xml');
 const xml=adb('shell','cat','/sdcard/wanba-qa-window.xml');
 return [...xml.matchAll(/<node\s+([^>]+)/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
};
const tap=node=>{assert.ok(node,'expected native picker node');const bounds=node.bounds.match(/\d+/g).map(Number);adb('shell','input','tap',String((bounds[0]+bounds[2])>>1),String((bounds[1]+bounds[3])>>1));};
const touch=async selector=>{await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await c.wait(100);const point=await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await c.wait(80);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
try {
 await c.until('!document.hidden');
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');
 await c.click('[data-tab="settings"]');await c.until('!!document.querySelector("#wb-export-data")');
 state.originalTheme=await c.evaluate('wanbaApp.inspect().theme');
 state.before=await c.evaluate('JSON.parse(localStorage.getItem("wanbanXiaowu_progress_v1"))');
 await c.click('#wb-export-data');await c.wait(600);
 let ui=nodes();state.filename=ui.find(n=>n.class==='android.widget.EditText')?.text;
 assert.ok(state.filename?.startsWith('玩吧-备份'));
 tap(ui.find(n=>n.class==='android.widget.EditText'));
 adb('shell','input','keycombination','113','29');
 state.filename='wanba-qa-'+Date.now()+'.json';adb('shell','input','text',state.filename);
 ui=nodes();const shownFilename=ui.find(n=>n.class==='android.widget.EditText')?.text;assert.ok(shownFilename?.endsWith(state.filename));state.filename=shownFilename;screenshot(`${rawOut}/compat-backup-create.png`);
 if(process.env.SAF_PROBE==='1'){console.log(JSON.stringify({filename:state.filename,nodes:ui.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,description:n['content-desc'],id:n['resource-id'],bounds:n.bounds}))},null,2));}
 else {
  tap(ui.find(n=>/^(保存|Save|SAVE)$/.test(n.text)&&n.enabled==='true')||ui.find(n=>n['resource-id']==='android:id/button1'));await c.wait(1000);
  await c.until('!document.hidden');
  const text=await c.evaluate('document.querySelector("#wanba-toast")?.textContent||document.querySelector("#wb-import-export-status")?.textContent||""');assert.match(text,/备份.*保存|保存.*备份/);
  const raw=adb('shell','cat','/sdcard/Download/'+state.filename),backup=JSON.parse(raw);
  assert.equal(backup.app,'玩吧');assert.deepEqual(backup.items.wanbanXiaowu_progress_v1,state.before);
  state.exportedProgressMatches=true;checks.push('ACTION_CREATE_DOCUMENT writes UTF8 JSON with unchanged actual saved game progress');
  await c.click('#wb-export-data');await c.wait(450);adb('shell','input','keyevent','4');await c.wait(400);
  assert.match(await c.evaluate('document.querySelector("#wanba-toast")?.textContent||""'),/取消/);checks.push('cancel backup reports visible cancellation');
  await touch('#wb-import-data');await c.wait(650);ui=nodes();
  const isBackupFile=n=>n.text===state.filename&&n['resource-id']==='android:id/title';
  if(!ui.some(isBackupFile)) {
   tap(ui.find(n=>n['resource-id'].endsWith('/option_menu_search')));adb('shell','input','text',state.filename);adb('shell','input','keyevent','66');await c.wait(700);ui=nodes();
  }
  const file=ui.find(isBackupFile);assert.ok(file,'newly exported backup visible in SAF picker');tap(file);await c.wait(800);
  await c.until('!!document.querySelector("#wb-confirm-ok")');await c.click('#wb-confirm-ok');await c.wait(500);
  assert.deepEqual(await c.evaluate('JSON.parse(localStorage.getItem("wanbanXiaowu_progress_v1"))'),state.before);
  checks.push('ACTION_OPEN_DOCUMENT -> native private file import -> Gecko FileReader -> explicit confirm preserves game progress');
  await touch('#wb-import-data');await c.wait(450);adb('shell','input','keyevent','4');await c.wait(400);
  assert.deepEqual(await c.evaluate('JSON.parse(localStorage.getItem("wanbanXiaowu_progress_v1"))'),state.before);checks.push('cancel import leaves saved games unchanged');
  screenshot(`${out}/compat-saf-complete.png`);console.log(JSON.stringify({passed:true,checks,filename:state.filename},null,2));
 }
} catch(error){screenshot(`${rawOut}/compat-saf-failure.png`);console.error(error);process.exitCode=1;}
finally {writeFileSync(`${out}/compat-saf-regression.json`,JSON.stringify({passed:process.exitCode!==1&&process.env.SAF_PROBE!=='1',checks,filename:state.filename},null,2));await c.close();}
