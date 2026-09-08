import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createI18n, normalizeLocale, LOCALES, LOCALE_STORAGE_KEY} from '../standalone/i18n.js';
const data=Object.fromEntries(LOCALES.map(({id})=>[id,JSON.parse(readFileSync(new URL('../locales/'+id+'.json',import.meta.url)))]));
const load=async id=>structuredClone(data[id]);
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),map};};

test('locale selection recognizes device regions and script variants',()=>{
  for(const [input,expected] of [['zh-CN','zh-CN'],['zh-Hans','zh-CN'],['zh-Hant-HK','zh-TW'],['zh_HK','zh-TW'],['zh-MO','zh-TW'],['en-GB','en'],['ja-JP','ja'],['ko-KR','ko'],['fr-FR','en']])assert.equal(normalizeLocale(input),expected,input);
});
test('every shipped locale contains all 37 titles, rule summaries and the same complete UI key set',()=>{
  const base=data['zh-CN'];assert.equal(Object.keys(base.games).length,37);
  for(const locale of LOCALES){const catalog=data[locale.id];assert.equal(catalog.locale,locale.id);assert.equal(catalog.version,'1.0.0');assert.deepEqual(Object.keys(catalog.games).sort(),Object.keys(base.games).sort());assert.deepEqual(Object.keys(catalog.strings).sort(),Object.keys(base.strings).sort());assert.deepEqual(Object.keys(catalog.templates).sort(),Object.keys(base.templates).sort());for(const item of Object.values(catalog.games)){assert.ok(item.title.length>0);assert.ok(item.rules.length>20);}}
});
test('language changes translate real controls and dynamic status while keeping source text available',async()=>{
  const storage=memory(),service=createI18n({load,storage,language:'zh-CN'});await service.init();
  for(const locale of ['en','ja','ko','zh-TW','zh-CN']){assert.equal(await service.setLocale(locale),true);assert.equal(service.locale,locale);assert.equal(storage.getItem(LOCALE_STORAGE_KEY),locale);assert.equal(service.translateSource('开始游戏'),data[locale].strings['开始游戏']);assert.equal(service.gameTitle('freecell'),data[locale].games.freecell.title);}
  await service.setLocale('en');assert.equal(service.translateSource('当前最高分：120分'),'Best: 120 points');assert.equal(service.translateSource('版本 1.2.0 · 兼容版'),'Version 1.2.0 · Bundled-engine edition');assert.equal(service.translateSource('空当接龙 · 游戏介绍'),'FreeCell · How to play');assert.equal(service.translateSource('胜率：2/3'),'Wins: 2/3');assert.equal(service.translateSource('Alice: 私人记录'),'Alice: 私人记录');assert.equal(service.translateSource('constructor'),'constructor');
  assert.equal(service.translateSource('步数 0 · 已归位 0/52'),'Moves 0 · Home 0/52');assert.equal(service.translateSource('随步归档：关'),'Auto-home after moves Off');assert.equal(service.translateSource('★ 0　金币 30'),'★ 0 · Coins 30');
});
test('saved preference overrides the device language and unavailable packs fall back to Chinese',async()=>{
  const storage=memory();storage.setItem(LOCALE_STORAGE_KEY,'ko');const service=createI18n({load:async id=>{if(id==='ja')throw Error('missing');return load(id);},storage,language:'en-US'});await service.init();assert.equal(service.locale,'ko');assert.equal(await service.setLocale('ja'),false);assert.equal(service.locale,'zh-CN');assert.equal(service.translateSource('暂停'),'暂停');
});
test('the most recent language selection wins when loading finishes out of order',async()=>{
  let resolveJa;const service=createI18n({load:async id=>id==='ja'?new Promise(resolve=>{resolveJa=()=>resolve(structuredClone(data.ja));}):load(id),language:'zh-CN'});await service.init();const slow=service.setLocale('ja');await service.setLocale('en');resolveJa();assert.equal(await slow,false);assert.equal(service.locale,'en');
});
test('translations remain inert text and missing entries preserve a readable fallback',async()=>{
  const service=createI18n({language:'en',load:async id=>{const catalog=await load(id);if(id==='en'){catalog.strings['开始游戏']='<img src=x onerror=alert(1)>';delete catalog.strings['暂停'];}return catalog;}});await service.init();assert.equal(service.translateSource('开始游戏'),'<img src=x onerror=alert(1)>');assert.equal(service.t('暂停'),'暂停');assert.equal(service.t('unknown',{},'Readable fallback'),'Readable fallback');const implementation=readFileSync(new URL('../standalone/i18n.js',import.meta.url),'utf8');assert.doesNotMatch(implementation,/\.innerHTML\s*=|\beval\s*\(|new Function\s*\(/);
});
test('Chinese rule text resolves host-role tokens without altering puzzle data',async()=>{
  const service=createI18n({load,language:'zh-CN'});await service.init();assert.doesNotMatch(service.gameRules('tictactoe'),/\{\{char\}\}/);assert.match(service.gameRules('tictactoe'),/电脑/);
});
