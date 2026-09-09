import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {normalizeCatalogPreferences} from '../standalone/catalog-preferences.js';
const source=fs.readFileSync(new URL('../src/runtime/wanban-app.js',import.meta.url),'utf8');
function harness({failSave=false,game=null}={}){
 const events=[],stored={catalog:{favorites:[],order:['paopao','zuma']},rememberWindow:true};
 const ctx=vm.createContext({currentGame:game,currentTab:'single',startupBlocked:false,
  GAME_META:{paopao:{id:'paopao',name:'泡泡龙',mode:'single'},zuma:{id:'zuma',name:'祖玛',mode:'single'}},
  normalizeCatalogPreferences,settings:()=>stored,setSettings:v=>{if(failSave)return false;Object.assign(stored,v);return true;},
  isPlainObject:v=>!!v&&typeof v==='object'&&!Array.isArray(v),renderSelect:tab=>events.push(['renderSelect',tab]),
  getHostWindow:()=>({dispatchEvent:e=>events.push(['event',e.detail])}),CustomEvent:class{constructor(type,p){this.type=type;this.detail=p.detail;}},
  saveStandaloneState:()=>events.push(['save']),stopGame:()=>events.push(['stop']),saveWindowState:(tab,game)=>events.push(['window',tab,game]),render:()=>events.push(['render']),
  renderGame:id=>{ctx.currentGame=id;events.push(['game',id]);},
  buildImportPlan:items=>{if(!items||!Object.keys(items).length)throw Error('empty');return items;},commitImportPlan:plan=>events.push(['import',plan]),
 });
 vm.runInContext(source.slice(source.indexOf('  function nativeNotifyNavigation()'),source.indexOf("  if (standalone) {\n    getHostDocument().body.classList.add('wanba-standalone');")),ctx);
 return {ctx,stored,events};
}
test('native catalog writes the same normalized settings and reports failed persistence',()=>{
 const {ctx,stored}=harness();assert.equal(ctx.nativeSetCatalog({favorites:['zuma','unknown','zuma'],order:['zuma']}).ok,true);
 assert.deepEqual(stored.catalog,{favorites:['zuma'],order:['zuma','paopao']});
 const fail=harness({failSave:true});assert.equal(fail.ctx.nativeSetCatalog({favorites:['zuma'],order:[]}).ok,false);assert.equal(fail.stored.catalog.favorites.length,0);assert(!fail.events.some(e=>e[0]==='renderSelect'));
 assert.equal(ctx.nativeSetCatalog({favorites:'bad',order:[]}).ok,false);
});
test('native launch preserves My return origin and rejects unknown/prototype IDs before touching the current game',()=>{
 const {ctx,events}=harness();for(const id of ['__proto__','constructor','https://bad.test','missing'])assert.equal(ctx.nativeLaunch(id,'my').ok,false);assert.equal(events.length,0);
 assert.equal(ctx.nativeLaunch('paopao','my').ok,true);assert.equal(ctx.currentTab,'my');assert.equal(ctx.currentGame,'paopao');
 const before=events.length;assert.equal(ctx.nativeOpenShellTab('intimacy').ok,false);assert.equal(events.length,before);
 assert.equal(ctx.nativeOpenShellTab('my').ok,true);assert.equal(ctx.currentGame,null);assert.equal(ctx.currentTab,'my');
});
test('native backup validation is read only and import requires confirmation and an idle game surface',()=>{
 const {ctx,events}=harness();const data=JSON.stringify({items:{progress:{paopao:{shots:4}}}});
 assert.equal(ctx.nativeValidateBackup(data).ok,true);assert.equal(events.length,0);
 assert.equal(ctx.nativeImportBackup(data).ok,false);assert.equal(events.length,0);
 assert.equal(ctx.nativeImportBackup('{broken',true).ok,false);assert.equal(events.length,0);
 assert.equal(ctx.nativeImportBackup(data,true).ok,true);assert.equal(events.filter(e=>e[0]==='import').length,1);assert.equal(ctx.currentTab,'settings');
 const active=harness({game:'paopao'});assert.equal(active.ctx.nativeImportBackup(data,true).ok,false);assert.equal(active.events.length,0);
});
test('remembered My launch survives a cold boot without moving to the games tab',()=>{
 const ctx=vm.createContext({settings:()=>({rememberWindow:true,lastTab:'my',lastGame:'paopao'}),GAME_META:{paopao:{mode:'single'}},standalone:true,currentTab:'single',currentGame:null});
 vm.runInContext(source.slice(source.indexOf('  function restoreWindowState()'),source.indexOf('  function scores()')),ctx);ctx.restoreWindowState();assert.equal(ctx.currentTab,'my');assert.equal(ctx.currentGame,'paopao');
});
