import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_VERSION,normalizeAppInfo,readAppInfo} from '../standalone/app-info.js';
test('iOS native metadata is WKWebView and never enables APK or game download modules',async()=>{
 const value={flavor:'ios',appVersion:APP_VERSION,versionCode:1,engineVersion:'26.5',providerVersion:'iOS 26.5',gameUpdatesEnabled:true,appUpdaterEnabled:true,nativeSelfUpdateEnabled:true};
 const info=await readAppInfo({NativeBridge:{getAppInfo:async()=>value}});
 assert.equal(info.flavor,'ios');assert.equal(info.engine,'WKWebView');assert.equal(info.source,'native');
 assert.equal(info.gameUpdatesEnabled,false);assert.equal(info.appUpdaterEnabled,false);assert.equal(info.nativeSelfUpdateEnabled,false);
});
test('unvalidated iOS metadata retains the explicit browser fallback',()=>{
 assert.equal(normalizeAppInfo({flavor:'ios',appVersion:APP_VERSION,versionCode:1,engineVersion:'bad version'}).source,'user-agent');
});
