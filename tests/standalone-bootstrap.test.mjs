import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../standalone/app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');

test('a bootstrap that finishes in the background pauses before notifying the native lifecycle queue', async () => {
  const events = [], window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  document.querySelector = () => ({remove:() => events.push('boot-removed')});
  let finishInit;
  const initializing = new Promise(resolve => {finishInit = resolve;});
  const runtime = {pause:() => events.push('paused'),ready:() => events.push('unblocked'),save(){},back(){return false;},inspect(){},notify(){}};
  window.addEventListener('wanba-app-ready',() => {
    assert.ok(Object.isFrozen(window.wanbaApp));
    assert.equal(events.at(-1),'boot-removed');
    events.push('ready');
  });
  const context = vm.createContext({window,document,Event,console,readAppInfo:async () => ({}),readContentState:async () => null,initI18n:async()=>{},initPerformance(){},preloadGameArt:async()=>{},observeLocalizedUI(){},installGameUpdates:()=>({}),confirmContentReady:async()=>events.push('healthy'),initWanbanXiaowu:() => initializing});
  const boot = vm.runInContext('(async () => {' + source + '})()',context);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  finishInit(runtime);
  await boot;
  assert.deepEqual(events,['paused','healthy','unblocked','paused','boot-removed','ready']);
  document.hidden = false;
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(events.at(-1),'paused');
});

test('failed durable health confirmation leaves the boot UI and game lock intact',async()=>{
 const events=[],window=new EventTarget(),document=new EventTarget();
 const status={innerHTML:'',querySelector:()=>({}),remove:()=>events.push('removed')};document.querySelector=()=>status;
 const runtime={ready:()=>events.push('unblocked'),pause(){},notify(){},inspect(){},save(){},back(){}};
 const context=vm.createContext({window,document,Event,console:{error(){}},readAppInfo:async()=>({}),readContentState:async()=>({activeSnapshotId:'new'}),initI18n:async()=>{},initPerformance(){},preloadGameArt:async()=>{},observeLocalizedUI(){},installGameUpdates:()=>({}),confirmContentReady:async()=>{throw Error('disk full');},initWanbanXiaowu:async options=>{assert.equal(options.startupBlocked,true);return runtime;}});
 await vm.runInContext('(async()=>{'+source+'})()',context);
 assert.deepEqual(events,[]);assert.equal(window.wanbaApp,undefined);assert.match(status.innerHTML,/重试/);
});
