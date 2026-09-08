// Production HTML selects -> real touch -> native XML bounds -> adb input tap.
// Run against an authorized test device: WANBA_ENGINE=compat ADB_SERIAL=... node tests/android-settings-touch.mjs
// PERFORMANCE_SELECT_OPTIONAL=1 reports an explicit skip for old content without that control.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,adb,screenshot,activity} from './android-driver.mjs';
import {touch,readSelect,nativeSelectValue,cancelNativeSelect} from './android-native-select.mjs';

if(process.env.WANBA_ENGINE==='compat'&&!process.env.ADB_SERIAL)throw Error('Set ADB_SERIAL explicitly for a compat physical-device run');
if(process.env.WANBA_ENGINE!=='compat'&&process.env.ADB_SERIAL&&process.env.ADB_SERIAL!=='emulator-5554')throw Error('The system driver is emulator-5554 only; it does not honor other ADB_SERIAL values');
const out=process.env.QA_OUT||'docs/evidence/android-settings-touch';mkdirSync(out,{recursive:true});
const packageId=activity.split('/')[0],results=[],skips=[];
let c,originalTheme,performanceAvailable=false,failure=null;
const value=async selector=>(await readSelect(c,selector))?.value;
const expectValue=(selector,expected)=>c.until(`document.querySelector(${JSON.stringify(selector)})?.value===${JSON.stringify(expected)}`);
async function settings() {
  for(let i=0;i<5;i++) {
    if(await c.evaluate('(()=>{const el=document.querySelector("[data-tab=settings]");const r=el?.getBoundingClientRect();return !wanbaApp.inspect().game&&r?.width>0&&r?.height>0})()'))break;
    const back=await c.evaluate('document.querySelector("#wb-back")?"#wb-back":null');
    if(back)await touch(c,back);else adb('shell','input','keyevent','KEYCODE_BACK');
    await c.wait(180);
  }
  await touch(c,'[data-tab="settings"]');await c.until('!!document.querySelector("#wanba-language")');
}
async function choose(selector,expected) {
  const evidence=await nativeSelectValue(c,selector,expected);await expectValue(selector,expected);results.push({...evidence,passed:true});
}
async function mode(next,confirm) {
  const before=await value('.m3-mode');
  results.push(await nativeSelectValue(c,'.m3-mode',next));
  await c.until('!!document.querySelector(".m3-confirm:not([hidden])")');
  assert.equal(await value('.m3-mode'),before,'Mode changed before game confirmation');
  await touch(c,confirm?'.m3-confirm-ok':'.m3-confirm-cancel');
  await c.until('!!document.querySelector(".m3-confirm[hidden]")');
  await expectValue('.m3-mode',confirm?next:before);
  assert.equal(await c.evaluate('wanbaApp.inspect().controller.mode'),confirm?next:before);
  results.push({selector:'.m3-mode',from:before,to:next,gameConfirmation:confirm?'confirmed':'cancelled',passed:true});
}
try {
  adb('shell','am','start','--activity-reorder-to-front','-n',activity);c=await connect();await settings();
  const language=await readSelect(c,'#wanba-language');
  assert.deepEqual(language.options.map(o=>o.value).sort(),['en','ja','ko','zh-CN','zh-TW'].sort());
  originalTheme=await value('#wb-theme');
  await choose('#wanba-language','zh-CN');await c.until('document.documentElement.lang==="zh-CN"');
  await choose('#wanba-language','en');await c.until('document.documentElement.lang==="en"');
  results.push(await cancelNativeSelect(c,'#wanba-language'));screenshot(`${out}/language-english.png`);
  await choose('#wanba-language','zh-CN');await c.until('document.documentElement.lang==="zh-CN"');
  const alternate=(await readSelect(c,'#wb-theme')).options.find(o=>!o.disabled&&o.value!==originalTheme);assert(alternate);
  await choose('#wb-theme',alternate.value);assert.equal(await c.evaluate('wanbaApp.inspect().theme'),alternate.value);
  results.push(await cancelNativeSelect(c,'#wb-theme'));screenshot(`${out}/theme-changed.png`);
  await choose('#wb-theme',originalTheme);
  performanceAvailable=!!(await readSelect(c,'#wanba-performance'));
  if(!performanceAvailable) {
    if(process.env.PERFORMANCE_SELECT_OPTIONAL!=='1')throw Error('Missing #wanba-performance; use PERFORMANCE_SELECT_OPTIONAL=1 only for older content');
    skips.push({selector:'#wanba-performance',reason:'Optional older content lacks performance picker; not counted as passed'});
  } else {
    assert.deepEqual((await readSelect(c,'#wanba-performance')).options.map(o=>o.value).sort(),['eco','normal','game'].sort());
    for(const profile of ['eco','normal','game']){await choose('#wanba-performance',profile);assert.equal(await c.evaluate('document.documentElement.dataset.wanbaPerformance'),profile);screenshot(`${out}/performance-${profile}.png`);}
    results.push(await cancelNativeSelect(c,'#wanba-performance'));await choose('#wanba-performance','normal');
  }
  // Deliberately persist non-default choices through HOME, process death, and reload.
  await choose('#wanba-language','en');await choose('#wb-theme',alternate.value);if(performanceAvailable)await choose('#wanba-performance','eco');
  adb('shell','input','keyevent','KEYCODE_HOME');await c.wait(10000);await c.close();c=null;
  adb('shell','am','force-stop',packageId);adb('shell','am','start','-n',activity);c=await connect();await settings();
  await expectValue('#wanba-language','en');await expectValue('#wb-theme',alternate.value);if(performanceAvailable)await expectValue('#wanba-performance','eco');
  assert.equal(await c.evaluate('document.documentElement.lang'),'en');assert.equal(await c.evaluate('wanbaApp.inspect().theme'),alternate.value);
  results.push({persistence:{homeWaitMs:10000,forceStopped:true,language:'en',theme:alternate.value,performance:performanceAvailable?'eco':'skipped'},passed:true});screenshot(`${out}/settings-after-process-restart.png`);
  await choose('#wanba-language','zh-CN');await choose('#wb-theme',originalTheme);if(performanceAvailable)await choose('#wanba-performance','normal');
  await touch(c,'[data-tab="single"]');
  await c.until('(()=>{const r=document.querySelector("[data-game=match3]")?.getBoundingClientRect();return r?.width>0&&r?.height>0})()');
  await touch(c,'[data-game="match3"]');await c.wait(200);
  let startTouched=false;
  for(let i=0;i<50&&!await c.evaluate('wanbaApp.inspect().started');i++) {
    if(!startTouched) {
      const selector=await c.evaluate('document.querySelector("#wb-progress-continue:not(:disabled)")?"#wb-progress-continue":document.querySelector("#wb-start-cover-btn:not(:disabled)")?"#wb-start-cover-btn":null');
      if(selector){await touch(c,selector);startTouched=true;}
    }
    // A dispatched start/continue enters a countdown; never tap its disabled cover again.
    await c.wait(150);
  }
  await c.until('wanbaApp.inspect().started&&!!document.querySelector(".m3-mode")');
  await c.until('!document.querySelector("#wb-count-cancel,#wb-resume-cancel")',15000);
  if(await c.evaluate('wanbaApp.inspect().paused'))await touch(c,'#wb-pause');
  await c.until('!wanbaApp.inspect().paused&&!document.querySelector(".m3-mode").disabled',15000);
  if(await value('.m3-mode')!=='classic')await mode('classic',true);
  const classicBoard=await c.evaluate('wanbaApp.inspect().controller.board');
  results.push(await cancelNativeSelect(c,'.m3-mode'));
  await mode('ice',false);assert.deepEqual(await c.evaluate('wanbaApp.inspect().controller.board'),classicBoard);
  await mode('ice',true);screenshot(`${out}/match3-ice-confirmed.png`);
  await mode('classic',true);assert.deepEqual(await c.evaluate('wanbaApp.inspect().controller.board'),classicBoard,'Returning to classic lost its board');
  screenshot(`${out}/match3-classic-restored.png`);await settings();
  await c.syncEvidence?.();assert.equal(c.errors.length,0,JSON.stringify(c.errors));
} catch(error) {
  failure=String(error.stack||error);process.exitCode=1;try{screenshot(`${out}/failure.png`);}catch{}console.error(error);
} finally {
  const restoration={language:false,theme:false,performance:performanceAvailable?false:'skipped'};
  if(c) {
    try {
      // BACK dismisses an outstanding native/game confirmation before navigation.
      adb('shell','input','keyevent','KEYCODE_BACK');await c.wait(150);await settings();
      await choose('#wanba-language','zh-CN');restoration.language=true;
      if(originalTheme){await choose('#wb-theme',originalTheme);restoration.theme=true;}
      if(performanceAvailable){await choose('#wanba-performance','normal');restoration.performance=true;}
      screenshot(`${out}/settings-restored.png`);
    } catch(error) {failure??='Restoration failed: '+String(error);process.exitCode=1;}
    await Promise.resolve(c.close()).catch(()=>{});
  }
  writeFileSync(`${out}/settings-touch-result.json`,JSON.stringify({passed:!failure,engine:process.env.WANBA_ENGINE||'system',serial:process.env.ADB_SERIAL||'emulator-5554',results,skips,restoration,failure,note:'All production select choices use real touch plus native UI XML bounds and adb tap. No value assignment or synthetic change. Native XML is temporary under .local and removed after parsing.'},null,2));
}
