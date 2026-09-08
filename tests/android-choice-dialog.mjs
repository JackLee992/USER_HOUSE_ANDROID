// Isolated temporary HTML controls exercising the real Android choice prompt.
// This script never assigns a production select value or dispatches change.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch,nativeNodes,nativeSelectValue,cancelNativeSelect} from './android-native-select.mjs';

if(process.env.WANBA_ENGINE==='compat'&&!process.env.ADB_SERIAL)throw Error('Set ADB_SERIAL explicitly for a compat device run');
if(process.env.WANBA_ENGINE!=='compat'&&process.env.ADB_SERIAL&&process.env.ADB_SERIAL!=='emulator-5554')throw Error('The system driver supports emulator-5554 only');
const out=process.env.QA_OUT||'docs/evidence/android-choice-dialog';mkdirSync(out,{recursive:true});
const rootId='wanba-choice-qa',single='#wanba-choice-qa-single',multiple='#wanba-choice-qa-multiple',results=[];
let c,dialogOpen=false,failure=null,cleanup=false;
const normalized=s=>String(s||'').replace(/\s+/g,' ').trim();
async function nodeFor(text,{buttonId}={}) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {
    const nodes=await nativeNodes();
    const found=nodes.find(n=>n.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1]
      && /^(?:io\.github\.jacklee992\.wanba(?:\.compat)?|android)$/.test(n.package||'')
      && /^android\.widget\.(?:CheckedTextView|RadioButton|TextView|Button)$/.test(n.class||'')
      && (buttonId?n['resource-id']===buttonId:normalized(n.text||n['content-desc'])===normalized(text)));
    if(found)return found;
    await c.wait(150);
  }
  throw Error('Native QA dialog item not found: '+(buttonId||text));
}
function tapNative(node) {
  const [x1,y1,x2,y2]=node.rect;
  adb('shell','input','tap',String(Math.floor((x1+x2)/2)),String(Math.floor((y1+y2)/2)));
}
async function openMultiple() {
  await touch(c,multiple);dialogOpen=true;
  await nodeFor('QA Alpha');
}
async function closeMultiple(confirm) {
  const button=await nodeFor('',{buttonId:confirm?'android:id/button1':'android:id/button2'});
  tapNative(button);dialogOpen=false;await c.wait(250);
}
const state=()=>c.evaluate(`(()=>{const root=document.getElementById('${rootId}');return {single:root.querySelector('select:not([multiple])').value,selected:[...root.querySelector('select[multiple]').options].filter(o=>o.selected).map(o=>o.value).sort(),events:root.qaEvents.slice()}})()`);
try {
  adb('shell','am','start','--activity-reorder-to-front','-n',activity);c=await connect();
  // A removable QA-only panel, not a production/game fixture or a data mutation.
  await c.evaluate(`(()=>{if(document.getElementById('${rootId}'))throw Error('QA panel already exists');const panel=document.createElement('section');panel.id='${rootId}';panel.style.cssText='position:fixed;inset:24px 12px auto;z-index:2147483000;padding:20px;background:#fff9ef;color:#142235;border:3px solid #b98e3c;border-radius:14px;font:16px system-ui';panel.innerHTML='<h2>Native choice QA</h2><p>Temporary controls — not game settings</p><label>Single choice<select id="wanba-choice-qa-single" style="display:block;width:100%;height:52px;margin:10px 0 24px"><option value="first" selected>QA First</option><option value="second">QA Second</option><option value="disabled" disabled>QA Disabled single</option><optgroup label="QA Disabled group" disabled><option value="group">QA Locked single</option></optgroup></select></label><label>Multiple choice<select id="wanba-choice-qa-multiple" multiple style="display:block;width:100%;height:56px;margin-top:10px"><option value="alpha" selected>QA Alpha</option><option value="bravo">QA Bravo</option><option value="disabled" disabled selected>QA Disabled selection</option><optgroup label="QA Locked group" disabled><option value="locked" selected>QA Locked selected</option></optgroup></select></label>';panel.qaEvents=[];panel.addEventListener('change',e=>panel.qaEvents.push({id:e.target.id,value:e.target.value,selected:[...e.target.options].filter(o=>o.selected).map(o=>o.value),trusted:e.isTrusted}));document.body.append(panel);return true})()`);
  const initial=await state();assert.deepEqual(initial.selected,['alpha','disabled','locked']);
  const singleSelection=await nativeSelectValue(c,single,'second');
  await c.until(`document.querySelector('${single}').value==='second'`);
  await c.wait(400);
  let current=await state();
  const singleEvents=current.events.filter(e=>e.id==='wanba-choice-qa-single');
  assert.equal(singleEvents.length,1,'One real single selection emitted duplicate/missing change');assert.equal(singleEvents[0].trusted,true);
  results.push({...singleSelection,changeCount:1,trusted:true,passed:true});screenshot(`${out}/single-selected.png`);
  results.push({...await cancelNativeSelect(c,single),passed:true});
  assert.equal((await state()).events.filter(e=>e.id==='wanba-choice-qa-single').length,1,'Native cancel emitted change');

  await touch(c,single);dialogOpen=true;
  const singleDisabled=await nodeFor('QA Disabled single'),singleLocked=await nodeFor('QA Locked single');
  assert.equal(singleDisabled.enabled,'false');assert.equal(singleLocked.enabled,'false');
  tapNative(singleDisabled);await c.wait(180);tapNative(singleLocked);await c.wait(180);
  assert.equal((await state()).single,'second');
  await nodeFor('QA Second');screenshot(`${out}/single-disabled-native.png`);
  adb('shell','input','keyevent','KEYCODE_BACK');dialogOpen=false;await c.wait(200);
  assert.equal((await state()).events.filter(e=>e.id==='wanba-choice-qa-single').length,1);
  results.push({single:'disabled-option-and-group',disabledOptionEnabled:singleDisabled.enabled,disabledGroupChildEnabled:singleLocked.enabled,unchanged:true,passed:true});

  // Verify disabled option and disabled optgroup descendants in native XML.
  await openMultiple();
  const disabled=await nodeFor('QA Disabled selection'),locked=await nodeFor('QA Locked selected');
  assert.equal(disabled.enabled,'false');assert.equal(locked.enabled,'false');
  assert.equal(disabled.checked,'true','Disabled initial selection was not retained');assert.equal(locked.checked,'true','Disabled group initial selection was not retained');
  screenshot(`${out}/multiple-disabled-native.png`);
  tapNative(disabled);await c.wait(180);tapNative(locked);await c.wait(180);
  assert.equal((await nodeFor('QA Disabled selection')).checked,'true');assert.equal((await nodeFor('QA Locked selected')).checked,'true');
  tapNative(await nodeFor('QA Bravo'));await c.wait(180);
  assert.equal((await nodeFor('QA Bravo')).checked,'true');
  screenshot(`${out}/multiple-bravo-pending.png`);
  await closeMultiple(true);current=await state();
  assert.deepEqual(current.selected,['alpha','bravo','disabled','locked']);
  assert.equal(current.events.filter(e=>e.id==='wanba-choice-qa-multiple').length,1);
  results.push({multiple:'add-bravo-confirm',selected:current.selected,disabledOptionEnabled:disabled.enabled,disabledGroupChildEnabled:locked.enabled,disabledTapsPreserved:true,passed:true});

  // Change a native check mark then CANCEL: the actual DOM selection must survive.
  await openMultiple();tapNative(await nodeFor('QA Alpha'));await c.wait(180);
  assert.equal((await nodeFor('QA Alpha')).checked,'false');
  await closeMultiple(false);current=await state();
  assert.deepEqual(current.selected,['alpha','bravo','disabled','locked']);
  assert.equal(current.events.filter(e=>e.id==='wanba-choice-qa-multiple').length,1,'Cancel emitted a multiple change');
  results.push({multiple:'cancel-uncheck-alpha',selected:current.selected,passed:true});

  // Confirm an actual deselection, keeping disabled original choices selected.
  await openMultiple();tapNative(await nodeFor('QA Alpha'));await c.wait(180);await closeMultiple(true);
  current=await state();assert.deepEqual(current.selected,['bravo','disabled','locked']);
  const multiEvents=current.events.filter(e=>e.id==='wanba-choice-qa-multiple');assert.equal(multiEvents.length,2);assert(multiEvents.every(e=>e.trusted));
  results.push({multiple:'remove-alpha-confirm',selected:current.selected,changeCount:multiEvents.length,trusted:true,passed:true});
  screenshot(`${out}/multiple-confirmed.png`);await c.syncEvidence?.();assert.equal(c.errors.length,0,JSON.stringify(c.errors));
} catch(error) {
  failure=String(error.stack||error);process.exitCode=1;try{screenshot(`${out}/failure.png`);}catch{}console.error(error);
} finally {
  if(c) {
    try {
      try {dialogOpen ||= (await nativeNodes()).some(n=>/^QA /.test(n.text||'')&&/^android\.widget\.(?:CheckedTextView|RadioButton)$/.test(n.class||''));} catch {}
      if(dialogOpen){adb('shell','input','keyevent','KEYCODE_BACK');await c.wait(180);}
      await c.evaluate(`(()=>{document.getElementById('${rootId}')?.remove();return !document.getElementById('${rootId}')})()`);cleanup=true;
    } catch(error) {failure??='Cleanup failed: '+String(error);process.exitCode=1;}
    await Promise.resolve(c.close()).catch(()=>{});
  }
  writeFileSync(`${out}/choice-dialog-result.json`,JSON.stringify({passed:!failure,engine:process.env.WANBA_ENGINE||'system',serial:process.env.ADB_SERIAL||'emulator-5554',results,cleanup,failure,note:'Only temporary isolated QA HTML controls are created. All actual choices use WebDriver touch and native XML coordinates. Raw native XML is removed by the shared helper after parsing.'},null,2));
}
