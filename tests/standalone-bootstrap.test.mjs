import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readContentState,confirmContentReady,parseNative} from '../standalone/content-state.js';

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
  const context = vm.createContext({window,document,Event,console,readAppInfo:async () => ({}),readContentState:async () => null,initI18n:async()=>{},initPerformance(){},preloadGameArt:async()=>{},observeLocalizedUI(){},installGameUpdates:()=>({refresh:async()=>{}}),confirmContentReady:async()=>events.push('healthy'),initWanbanXiaowu:() => initializing});
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
 const context=vm.createContext({window,document,Event,console:{error(){}},readAppInfo:async()=>({}),readContentState:async()=>({activeSnapshotId:'new'}),initI18n:async()=>{},initPerformance(){},preloadGameArt:async()=>{},observeLocalizedUI(){},installGameUpdates:()=>({refresh:async()=>{throw Error('must not refresh before durable confirmation');}}),confirmContentReady:async()=>{throw Error('disk full');},initWanbanXiaowu:async options=>{assert.equal(options.startupBlocked,true);return runtime;}});
 await vm.runInContext('(async()=>{'+source+'})()',context);
 assert.deepEqual(events,[]);assert.equal(window.wanbaApp,undefined);assert.match(status.innerHTML,/重试/);
});

test('an active notification arriving during asynchronous durable confirmation reconciles the real update panel before app-ready without focus',async()=>{
  class Element extends EventTarget {
    constructor(tag='div'){super();this.tag=tag;this.children=[];this.parent=null;this.id='';this.className='';this.textContent='';}
    get isConnected(){return this.root===true||!!this.parent?.isConnected;}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this.append(...children);}
    insertBefore(child,before){child.parent=this;this.children.splice(this.children.indexOf(before),0,child);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
    setAttribute(){}
    querySelector(selector){
      if(selector===':scope > .wb-cardgrid')return this.children.find(child=>child.className==='wb-cardgrid');
      const match=node=>selector[0]==='#'?node.id===selector.slice(1):node.className.split(' ').includes(selector.slice(1));
      for(const child of this.children){if(match(child))return child;const found=child.querySelector(selector);if(found)return found;}return null;
    }
  }
  const window=new EventTarget(),document=new EventTarget(),root=new Element(),body=new Element(),grid=new Element(),bootUI=new Element();
  root.root=true;body.id='wb-body';grid.className='wb-cardgrid';bootUI.id='wanba-boot';body.append(grid);root.append(bootUI,body);
  document.body=root;document.hidden=false;document.createElement=tag=>new Element(tag);
  document.querySelector=selector=>selector==='#wb-body > .wb-cardgrid'?grid:root.querySelector(selector);
  const events=[];let nativeState={activeSnapshotId:'new',active:{snapshotVersion:'1.2.1'},bootHealthy:false,job:{state:'activating',message:'正在激活'}};
  window.NativeBridge={
    getContentState:async()=>JSON.stringify(nativeState),checkGameUpdates(){},
    reportGameContentReady:async()=>{setTimeout(()=>{
      events.push(['early-active-event',!!window.wanbaApp]);
      nativeState={...nativeState,bootHealthy:true,job:{state:'active',message:'游戏内容已就绪'}};
      window.wanbaApp?.onGameUpdate('{}');
    },0);return '{"accepted":true}';},
  };
  const runtime={pause(){},save(){},back(){},notify:message=>assert.fail(message),inspect:()=>({game:null,games:[]}),ready(){assert.equal(nativeState.bootHealthy,true);events.push('unblocked');}};
  let updater,readyPanel;
  window.addEventListener('wanba-app-ready',()=>{readyPanel={disabled:document.querySelector('#wanba-check-games').disabled,status:document.querySelector('#wanba-update-status').textContent};});
  const context=vm.createContext({window,document,Event,console,readContentState,confirmContentReady,parseNative,
    MutationObserver:class{observe(){}},readAppInfo:async()=>({}),initI18n:async()=>{},initPerformance(){},preloadGameArt:async()=>{},observeLocalizedUI(){},
    initWanbanXiaowu:async options=>{assert.equal(options.startupBlocked,true);return runtime;}});
  const updatesSource=readFileSync(new URL('../standalone/game-updates.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
  const install=vm.runInContext('(()=>{'+updatesSource+';return installGameUpdates;})()',context);
  context.installGameUpdates=options=>{updater=install(options);assert.equal(document.querySelector('#wanba-check-games').disabled,true,'initial activating state disables checks');return updater;};
  await vm.runInContext('(async()=>{'+source+'})()',context);
  assert.deepEqual(events,[['early-active-event',false],'unblocked'],'native event precedes app publication, which still follows durable confirmation');
  assert.deepEqual(readyPanel,{disabled:false,status:'游戏内容已就绪'},'first app-ready paint must show the committed native state without a focus event');
  assert.equal(updater.getState().job.state,'active');assert.equal(document.querySelector('#wanba-boot'),null);
});
