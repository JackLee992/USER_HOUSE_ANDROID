import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_VERSION, GAME_BASELINE, normalizeAppInfo, readAppInfo, readWebCapabilities } from '../standalone/app-info.js';

test('system metadata comes from the installed application and actual WebView package', async () => {
  const app = await readAppInfo({NativeBridge:{getAppInfo:() => JSON.stringify({appVersion:APP_VERSION,versionCode:2,flavor:'system',engine:'Android System WebView',engineVersion:'124.0.6367.219',providerVersion:'12.1.1.324'})}});
  assert.equal(app.appVersion,APP_VERSION); assert.equal(app.gameBaseline,'3.10.0');
  assert.equal(app.engineLabel,'系统 Android WebView'); assert.equal(app.engineVersion,'124.0.6367.219');
  assert.equal(app.providerVersion,'12.1.1.324');
  assert.equal(app.source,'native'); assert.equal(app.versionMatches,true);
});

test('compat accepts a Promise from the isolated Gecko WebExtension bridge', async () => {
  const app = await readAppInfo({NativeBridge:{getAppInfo:async () => JSON.stringify({appVersion:APP_VERSION,versionCode:2,flavor:'compat',engine:'GeckoView',engineVersion:'155.0.1',providerVersion:'155.0.1 (20260903215306)'})}});
  assert.equal(app.flavorLabel,'兼容版'); assert.equal(app.engineLabel,'内置 GeckoView');
  assert.equal(app.engineVersion,'155.0.1'); assert.equal(app.source,'native');
  assert.equal(app.providerVersion,'155.0.1 (20260903215306)');
});

test('invalid or absent native metadata is explicitly a UA detection, not an embedded-engine claim', () => {
  const ua = 'Mozilla/5.0 (Android 15; Mobile; rv:155.0) Gecko/155.0 Firefox/155.0';
  for (const raw of [null,'broken',{flavor:'compat',appVersion:APP_VERSION,versionCode:2,engineVersion:'<script>'}]) {
    const app=normalizeAppInfo(raw,ua);
    assert.equal(app.source,'user-agent'); assert.equal(app.flavor,'preview');
    assert.equal(app.engineLabel,'Firefox / Gecko'); assert.equal(app.engineVersion,'155.0');
    assert.equal(app.versionCode,null); assert.equal(app.versionMatches,null);
  }
});

test('old native APK with new web assets stays visibly distinguishable', () => {
  const app=normalizeAppInfo({appVersion:'1.0.0',versionCode:1,flavor:'system',engineVersion:'124.0.6367.219'});
  assert.equal(app.appVersion,'1.0.0'); assert.equal(app.webVersion,APP_VERSION);
  assert.equal(app.versionMatches,false); assert.equal(app.gameBaseline,GAME_BASELINE);
  assert.equal(app.gameUpdatesEnabled,true); assert.equal(app.nativeSelfUpdateEnabled,true);
  assert.equal(app.appUpdaterEnabled,false);
});

test('native build capabilities keep offline and optional updater interfaces distinct', () => {
  const native={appVersion:APP_VERSION,versionCode:4,flavor:'system',engineVersion:'124.0',gameUpdatesEnabled:false,nativeSelfUpdateEnabled:false,appUpdaterEnabled:false};
  const offline=normalizeAppInfo(native);
  assert.equal(offline.gameUpdatesEnabled,false); assert.equal(offline.nativeSelfUpdateEnabled,false); assert.equal(offline.appUpdaterEnabled,false);
  const optIn=normalizeAppInfo({...native,nativeSelfUpdateEnabled:true,appUpdaterEnabled:true});
  assert.equal(optIn.gameUpdatesEnabled,false); assert.equal(optIn.nativeSelfUpdateEnabled,true); assert.equal(optIn.appUpdaterEnabled,true);
});

test('missing or unresponsive Gecko port cannot stall application boot', async () => {
  for(const getAppInfo of [() => {throw Error('port closed');},() => Promise.reject(Error('port closed')),() => new Promise(() => {})]) {
    const app=await readAppInfo({NativeBridge:{getAppInfo}},10);
    assert.equal(app.source,'user-agent'); assert.equal(app.flavor,'preview');
  }
});

test('capability inspection reports actual APIs without installing globals or polyfills', () => {
  const host={CanvasRenderingContext2D:{prototype:{roundRect(){}}},WebAssembly:{instantiate(){}},ResizeObserver:function(){},PointerEvent:function(){},CSS:{supports:() => true}};
  assert.deepEqual(readWebCapabilities(host),{canvasRoundRect:true,wasm:true,resizeObserver:true,pointerEvents:true,containerUnits:true,colorMix:true});
  assert.deepEqual(readWebCapabilities({}),{canvasRoundRect:false,wasm:false,resizeObserver:false,pointerEvents:false,containerUnits:false,colorMix:false});
  assert.equal(Object.keys(host.CanvasRenderingContext2D.prototype).length,1);
});
