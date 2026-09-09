import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { constrainStandaloneSettings, STANDALONE_THEMES } from '../standalone/capabilities.js';
import { normalizeCatalogPreferences } from '../standalone/catalog-preferences.js';
import { requireCompatibleSave,gameContentMetadata,captureStorage } from '../standalone/content-state.js';

test('legacy settings cannot enable host services or external fonts', () => {
  const old = { companion:true, petDesktopEnabled:true, messageNotify:true, intimacyMode:true, injectChat:true, floatingBallEnabled:true, autoLog:true, theaterEnabled:true, apiKey:'secret', apiUrl:'https://example.test', theme:'tavern', lastTab:'intimacy', selectedFont:'remote', customFonts:[{name:'remote',url:'https://example.test/font'}] };
  const clean = constrainStandaloneSettings(old);
  for (const key of ['companion','petDesktopEnabled','messageNotify','intimacyMode','injectChat','floatingBallEnabled','autoLog','theaterEnabled']) assert.equal(clean[key], false, key);
  assert.equal(clean.apiKey, ''); assert.equal(clean.apiUrl, '');
  assert.deepEqual(clean.customFonts, []); assert.equal(clean.selectedFont, '');
  assert.equal(clean.theme, 'day'); assert.equal(clean.lastTab, 'single');
  assert.equal(old.companion, true, 'imported object remains untouched');
});

test('old themes converge on one design while catalog and window preferences survive', () => {
  assert.equal(STANDALONE_THEMES.length, 1);
  for (const theme of ['day','arcade','spring','mono','night','cyber','card','bad']) assert.equal(constrainStandaloneSettings({theme}).theme, 'day');
  const catalog={favorites:['freecell'],order:['freecell','match3']};
  assert.deepEqual(constrainStandaloneSettings({catalog,lastTab:'my'}).catalog,catalog);
  assert.equal(constrainStandaloneSettings({lastTab:'my'}).lastTab,'my');
  assert.equal(constrainStandaloneSettings({rememberWindow:false}).rememberWindow, false);
  assert.equal(constrainStandaloneSettings({}).rememberWindow, true);
});

const source = fs.readFileSync(new URL('../src/runtime/wanban-app.js',import.meta.url),'utf8');
function backupHarness({failOnce = false} = {}) {
  const keys = {STORAGE_SETTINGS:'wanbanXiaowu_settings_v1',STORAGE_SCORES:'wanbanXiaowu_scores_v1',STORAGE_PROGRESS:'wanbanXiaowu_progress_v1',STORAGE_RECORDS:'wanbanXiaowu_records_v1',STORAGE_SUDOKU_STATE:'wanbanXiaowu_sudokuState_v1',STORAGE_WORLD_PRESETS:'world',STORAGE_SUMMARIES:'summaries',STORAGE_LINES:'lines',STORAGE_ROLE_LINES:'roleLines',STORAGE_THEATERS:'theaters',STORAGE_LINE_PRESET_SELECTION:'selection',STORAGE_WORD_GUESS_BANK:'wordBank',STORAGE_SUMMARY_REQ:'request'};
  const store = new Map([[keys.STORAGE_SETTINGS,'{"theme":"night"}'],[keys.STORAGE_SCORES,'{"snake":23}']]);
  let remaining = failOnce ? 2 : Infinity;
  const ctx = vm.createContext({...keys,standalone:true,GAME_META:{freecell:{},match3:{}},contentForGame:id=>gameContentMetadata(id,null),requireCompatibleSave,DEFAULT_SETTINGS:{theme:'day',catalog:{favorites:[],order:[]},companion:false,customFonts:[],rememberWindow:true},constrainStandaloneSettings,normalizeCatalogPreferences,
    settings:() => ({theme:'night'}),safeObject:v => v && typeof v === 'object' && !Array.isArray(v) ? v : {},safeArray:v => Array.isArray(v) ? v : [],isPlainObject:v => v && typeof v === 'object' && !Array.isArray(v),
    localStorage:{getItem:key => store.get(key) ?? null,setItem:(key,value) => {if (--remaining === 0) throw Object.assign(new Error('quota'),{name:'QuotaExceededError'}); store.set(key,value);},removeItem:key=>store.delete(key)} });
  vm.runInContext(source.slice(source.indexOf('  function exportDataKeys()'),source.indexOf('  function exportAllData()')),ctx);
  return {ctx,store,keys};
}
test('old plugin backup imports only game data and strips unavailable capabilities', () => {
  const {ctx,keys} = backupHarness();
  const plan = ctx.buildImportPlan({[keys.STORAGE_SETTINGS]:{theme:'cyber',companion:true},[keys.STORAGE_SCORES]:{snake:50},[keys.STORAGE_PROGRESS]:{freecell:{state:{moves:2}}},[keys.STORAGE_WORD_GUESS_BANK]:['private'],[keys.STORAGE_LINES]:{private:'dialogue'}});
  assert.deepEqual(Object.keys(plan).sort(),[keys.STORAGE_SETTINGS,keys.STORAGE_SCORES,keys.STORAGE_PROGRESS].sort());
  assert.equal(plan[keys.STORAGE_SETTINGS].companion,false);
  assert.equal(plan[keys.STORAGE_SETTINGS].theme,'day');
  assert.equal(plan[keys.STORAGE_SCORES].snake,50);
});
test('invalid or unrelated backup cannot erase existing game data', () => {
  const {ctx,store} = backupHarness(), before = [...store];
  for (const data of [null,[],{unrelated:'content'}]) assert.throws(()=>ctx.buildImportPlan(data));
  assert.deepEqual([...store],before);
});
test('incompatible game schema import is refused before replacing existing saves',()=>{
  const {ctx,keys,store}=backupHarness(),before=[...store];
  assert.throws(()=>ctx.buildImportPlan({[keys.STORAGE_PROGRESS]:{match3:{rulesVersion:4,_content:{runtimeApi:1,saveSchema:4}}}}),/已保留原存档/);
  assert.deepEqual([...store],before);
});
test('failed partial import restores all original keys', () => {
  const {ctx,store,keys} = backupHarness({failOnce:true}), before = [...store];
  assert.throws(()=>ctx.commitImportPlan({[keys.STORAGE_SETTINGS]:{theme:'cyber'},[keys.STORAGE_SCORES]:{snake:99}}),/保留原数据/);
  assert.deepEqual([...store],before);
});
test('native pause cancels countdown before freezing iframe and synchronously saving', () => {
  const pause = source.slice(source.indexOf('  function pauseStandalone()'),source.indexOf('  function standaloneBack()'));
  const events = [];
  const ctx = vm.createContext({qs:key=>({click:()=>events.push(key)}),qsa:()=>[{contentWindow:{cadetHost:{pause:()=>events.push('native')}}}],pauseGameForInactiveSurface:()=>events.push('paused'),saveStandaloneState:()=>events.push('saved'),console});
  vm.runInContext(pause,ctx); ctx.pauseStandalone();
  assert.deepEqual(events,['#wb-resume-cancel','#wb-count-cancel','paused','native','saved']);
});

test('Android back cancels a visible match-three dialog before leaving the game', () => {
  const back = source.slice(source.indexOf('  function standaloneBack()'),source.indexOf('  function nativeCatalog()'));
  let dialogVisible = true;
  const events = [], selector = '.m3-confirm:not([hidden]) .m3-confirm-cancel';
  const ctx = vm.createContext({
    qs:requested => { assert.equal(requested,selector); return dialogVisible ? {click:() => { dialogVisible=false; events.push('cancel'); }} : null; },
    qsa:() => [], currentGame:'match3', currentTab:'single',
    saveStandaloneState:() => events.push('save'), stopGame:() => events.push('stop'),
    saveWindowState:() => events.push('window'), render:() => events.push('render'),
  });
  vm.runInContext(back,ctx);
  assert.equal(ctx.standaloneBack(),true);
  assert.deepEqual(events,['cancel']); assert.equal(ctx.currentGame,'match3');
  assert.equal(ctx.standaloneBack(),true);
  assert.deepEqual(events,['cancel','save','stop','window','render']); assert.equal(ctx.currentGame,null);
});

test('catalog preferences survive backup import and malformed IDs cannot replace the game inventory',()=>{
  const {ctx,keys}=backupHarness();
  const plan=ctx.buildImportPlan({[keys.STORAGE_SETTINGS]:{catalog:{favorites:['match3','bad','match3'],order:['match3','missing','match3']}}});
  assert.deepEqual(JSON.parse(JSON.stringify(plan[keys.STORAGE_SETTINGS].catalog)),{favorites:['match3'],order:['match3','freecell']});
});

test('the legacy empty Sudoku key remains null through ordinary backup restore',()=>{
  const {ctx,keys}=backupHarness();
  const plan=ctx.buildImportPlan({[keys.STORAGE_SUDOKU_STATE]:null});
  assert.equal(plan[keys.STORAGE_SUDOKU_STATE],null);
  ctx.commitImportPlan(plan);
  assert.equal(ctx.localStorage.getItem(keys.STORAGE_SUDOKU_STATE),null);
  assert.equal(captureStorage(ctx.localStorage)[keys.STORAGE_SUDOKU_STATE],null);
});
