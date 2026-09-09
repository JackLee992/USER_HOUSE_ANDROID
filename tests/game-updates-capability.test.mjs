import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {gameUpdatesAvailable,installGameUpdates} from '../standalone/game-updates.js';
import {confirmContentReady,gameContentMetadata,readContentState} from '../standalone/content-state.js';

test('explicit native OFF capability wins over exposed legacy bridge methods',()=>{
  const host={NativeBridge:{checkGameUpdates(){throw Error('must not invoke');}}};
  assert.equal(gameUpdatesAvailable({gameUpdatesEnabled:false},host),false);
  assert.equal(gameUpdatesAvailable({gameUpdatesEnabled:true},host),true);
  assert.equal(gameUpdatesAvailable({},host),true,'older enabled APKs retain their original behavior');
  assert.equal(gameUpdatesAvailable(null,{}),false,'browser previews do not invent native capability');
});

test('OFF installer creates no controls, network refresh or gesture listeners',async()=>{
  const unexpected=new Proxy({}, {get(_target,key){throw Error('OFF updater must not access '+String(key));}});
  const initialState={gameUpdatesEnabled:false,activeSnapshotId:'builtin',bootHealthy:true};
  const updater=installGameUpdates({host:unexpected,document:unexpected,runtime:unexpected,initialState});
  updater.onEvent();assert.equal(await updater.refresh(),initialState);assert.equal(updater.getState(),initialState);
});

test('OFF content state still carries per-game versions and completes the normal boot handshake',async()=>{
  const state={gameUpdatesEnabled:false,activeSnapshotId:'signed-builtin',bootHealthy:true,restoreStorage:null,
    active:{runtimeApi:1,games:{zuma:{version:'1.1.0',saveSchema:1,art:['art.zuma']}},packages:[{id:'art.zuma',version:'1.1.0'}]}};
  for(const asynchronous of [false,true]){
    let ready=0;const serialized=JSON.stringify(state),host={NativeBridge:{
      getContentState:()=>asynchronous?Promise.resolve(serialized):serialized,
      reportGameContentReady:id=>{assert.equal(id,state.activeSnapshotId);ready++;return '{"accepted":true}';},
    }};
    const content=await readContentState(host);assert.equal(content.gameUpdatesEnabled,false);
    await confirmContentReady(host,content.activeSnapshotId);assert.equal(ready,1);
    assert.equal(gameContentMetadata('zuma',content).gameVersion,'1.1.0');
    assert.deepEqual(gameContentMetadata('zuma',content).artVersions,{'art.zuma':'1.1.0'});
  }
});

function aboutSettings(capabilities,bridge={}) {
  const source=readFileSync(new URL('../src/runtime/wanban-app.js',import.meta.url),'utf8');
  const start=source.indexOf('  function renderStandaloneSettings()'),end=source.indexOf('  function showStandaloneLicenses()',start);
  const body={innerHTML:''},nodes=new Map(),calls=[];
  const qs=selector=>{
    if(selector==='#wb-body')return body;
    if(selector.startsWith('#')&&!body.innerHTML.includes('id="'+selector.slice(1)+'"'))return null;
    if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);
  };
  const context=vm.createContext({qs,settings:()=>({theme:'day',rememberWindow:true}),syncPopupModeClass(){},
    standaloneAppInfo:{appVersion:'1.2.1',flavorLabel:'系统版',engineLabel:'系统 Android WebView',source:'native',...capabilities},
    STANDALONE_THEMES:[['day','白天']],GAME_META:{zuma:{}},EXTENSION_VERSION:'3.10.0',esc:String,
    mountLanguagePicker(){},mountPerformancePicker(){},setSettings(){},toast:message=>calls.push(['toast',message]),
    exportAllData(){},importAllDataFromFile(){},window:{NativeBridge:bridge,open:(...args)=>calls.push(['external',...args])},
  });
  vm.runInContext(source.slice(start,end),context);context.renderStandaloneSettings();return {body,nodes,calls};
}

test('non-self-updating about page has no download link, install hint or optional updater affordance',()=>{
  const page=aboutSettings({nativeSelfUpdateEnabled:false,appUpdaterEnabled:false});
  assert.ok(!page.body.innerHTML.includes('wanba-downloads'));assert.ok(!page.body.innerHTML.includes('wanba-app-update'));
  assert.ok(!page.body.innerHTML.includes('从下载页安装'));assert.ok(page.body.innerHTML.includes('wanba-credits'));
  assert.ok(page.body.innerHTML.includes('wb-export-data'),'save backups remain available');
});

test('old native and browser defaults retain downloads while the opt-in app updater uses only its native entry',()=>{
  const old=aboutSettings({});old.nodes.get('#wanba-downloads').onclick();
  assert.equal(old.calls[0][0],'external');assert.ok(!old.body.innerHTML.includes('wanba-app-update'));
  let opened=0;const modular=aboutSettings({nativeSelfUpdateEnabled:false,appUpdaterEnabled:true},{openAppUpdater:()=>opened++});
  assert.ok(!modular.body.innerHTML.includes('wanba-downloads'));modular.nodes.get('#wanba-app-update').onclick();
  assert.equal(opened,1);assert.deepEqual(modular.calls,[],'optional updater does not fall back to a GitHub browser link');
});

test('the optional app updater label already has translations in all five language packages',()=>{
  for(const locale of ['zh-CN','zh-TW','en','ja','ko']) {
    const data=JSON.parse(readFileSync(new URL(`../locales/${locale}.json`,import.meta.url),'utf8'));
    assert.ok(data.strings['检查更新'],`${locale}: missing app update action translation`);
  }
});
