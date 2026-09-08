import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {connect,adb,screenshot} from './android-cdp.mjs';
const c=await connect(),checks=[];
const nodes=()=>{adb('shell','uiautomator','dump','/sdcard/wanba-window.xml');const xml=adb('shell','cat','/sdcard/wanba-window.xml');return [...xml.matchAll(/<node\s+([^>]+)/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));};
const tap=n=>{if(!n)throw Error('Expected native UI node missing');const p=n.bounds.match(/\d+/g).map(Number);adb('shell','input','tap',String((p[0]+p[2])/2|0),String((p[1]+p[3])/2|0));};
const touch=async selector=>{const p=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.wait(70);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
try{
 await c.evaluate('document.querySelector("#wb-theme").value="cyber";document.querySelector("#wb-theme").dispatchEvent(new Event("change"))');
 await c.click('#wb-export-data');await c.wait(450);
 const saveUI=nodes(),name=saveUI.find(n=>n.class==='android.widget.EditText')?.text;assert.ok(name?.startsWith('玩吧-备份'));
 screenshot('docs/evidence/android-1.0/backup-save-device.png');tap(saveUI.find(n=>n['resource-id']==='android:id/button1'));await c.wait(700);
 const raw=adb('shell','cat','/sdcard/Download/'+name),backup=JSON.parse(raw);assert.equal(backup.app,'玩吧');assert.equal(backup.items.wanbanXiaowu_settings_v1.theme,'cyber');assert.ok(backup.items.wanbanXiaowu_progress_v1.freecell);
 writeFileSync('.local/saf-export.json',raw);checks.push('Android ACTION_CREATE_DOCUMENT wrote valid backup to Downloads');
 assert.match(await c.evaluate('document.querySelector("#wanba-toast").textContent'),/备份.*保存|保存.*备份/);
 await c.click('#wb-export-data');await c.wait(350);adb('shell','input','keyevent','4');await c.wait(400);assert.match(await c.evaluate('document.querySelector("#wanba-toast").textContent'),/取消/);checks.push('cancel export returns visible cancellation and permits another operation');
 await c.evaluate('document.querySelector("#wb-theme").value="day";document.querySelector("#wb-theme").dispatchEvent(new Event("change"))');
 await touch('#wb-import-data');await c.wait(500);const importUI=nodes();tap(importUI.find(n=>n.text===name));await c.wait(700);
 await c.until('!!document.querySelector("#wb-confirm-ok")');await c.click('#wb-confirm-ok');await c.wait(400);assert.equal(await c.evaluate('wanbaApp.inspect().theme'),'cyber');
 checks.push('real SAF JSON selection -> FileReader -> user confirm restores exported theme and progress');
 await touch('#wb-import-data');await c.wait(350);adb('shell','input','keyevent','4');await c.wait(400);assert.equal(await c.evaluate('wanbaApp.inspect().theme'),'cyber');checks.push('cancel import leaves existing theme and progress unchanged');
 await c.click('#wanba-credits');await c.click('#wanba-licenses');await c.click('[data-license="ENGINE-LICENSE.txt"]');await c.until('document.querySelector(".wanba-license-text")?.textContent.includes("Permission")');assert.ok((await c.evaluate('document.querySelector(".wanba-license-text").textContent')).length>800);adb('shell','input','keyevent','4');await c.wait(250);assert.equal(await c.evaluate('!!document.querySelector("#wanba-license-view-mask")'),false);assert.equal(await c.evaluate('!!document.querySelector("#wanba-licenses-mask")'),true);checks.push('packaged license readable offline; native back closes only top modal');
 for(let n=0;n<4;n++)await c.evaluate('wanbaApp.back()');await c.click('[data-tab="settings"]');
 writeFileSync('.local/upgrade-before.json',JSON.stringify(await c.evaluate('Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith("wanbanXiaowu_")).map(k=>[k,localStorage.getItem(k)]))')));
 console.log(JSON.stringify({passed:true,checks,backupFile:name},null,2));
}catch(e){screenshot('docs/evidence/android-1.0/saf-failure.png');console.error(e);process.exitCode=1}finally{writeFileSync('docs/evidence/android-1.0/saf-regression.json',JSON.stringify({passed:process.exitCode!==1,checks},null,2));c.close()}
