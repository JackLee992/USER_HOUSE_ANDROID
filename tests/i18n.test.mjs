import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createI18n, initI18n, translateSource, normalizeLocale, LOCALES, LOCALE_STORAGE_KEY} from '../standalone/i18n.js';
const data=Object.fromEntries(LOCALES.map(({id})=>[id,JSON.parse(readFileSync(new URL('../locales/'+id+'.json',import.meta.url)))]));
const versions=JSON.parse(readFileSync(new URL('../content/versions.json',import.meta.url)));
const load=async id=>structuredClone(data[id]);
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),map};};

test('locale selection recognizes device regions and script variants',()=>{
  for(const [input,expected] of [['zh-CN','zh-CN'],['zh-Hans','zh-CN'],['zh-Hant-HK','zh-TW'],['zh_HK','zh-TW'],['zh-MO','zh-TW'],['en-GB','en'],['ja-JP','ja'],['ko-KR','ko'],['fr-FR','en']])assert.equal(normalizeLocale(input),expected,input);
});
test('every shipped locale contains all 37 titles, rule summaries and the same complete UI key set',()=>{
  const base=data['zh-CN'];assert.equal(Object.keys(base.games).length,37);
  for(const locale of LOCALES){const catalog=data[locale.id];assert.equal(catalog.locale,locale.id);assert.equal(catalog.version,versions.packages['i18n.'+locale.id]);assert.deepEqual(Object.keys(catalog.games).sort(),Object.keys(base.games).sort());assert.deepEqual(Object.keys(catalog.strings).sort(),Object.keys(base.strings).sort());assert.deepEqual(Object.keys(catalog.templates).sort(),Object.keys(base.templates).sort());for(const item of Object.values(catalog.games)){assert.ok(item.title.length>0);assert.ok(item.rules.length>20);}}
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
test('all five languages cover native update states, download errors and performance controls',async()=>{
  const labels=['当前题','题库来源','性能与画质','性能模式','省电','普通','游戏','正在检查游戏内容','游戏内容已是最新','已有可用更新','发现可用的游戏内容更新','正在下载变化的资源包','下载完成，回到首页后可安装','正在切换已验证的内容','游戏内容已就绪','新版内容未能启动，已恢复上一版本和更新前存档','已回到上一内容版本，当前存档保留','可用空间不足，请清理空间后重试','下载包校验失败'];
  for(const {id}of LOCALES){const service=createI18n({load,language:id});await service.init();for(const label of labels)assert.equal(service.translateSource(label),data[id].strings[label],id+' '+label);assert.equal(service.translateSource('正在下载 game.paopao'),service.t('downloadingPackage',{value:'game.paopao'}));assert.equal(service.translateSource('GitHub 下载失败（503），已保留离线内容'),service.t('githubDownloadFailure',{value:'503'}));assert.equal(service.translateSource('内容更新暂不可用：下载包校验失败'),service.t('contentUnavailable',{value:service.t('下载包校验失败')}));}
});

test('every catalog label, accessible action and settings message translates in all five languages', async () => {
  const source=readFileSync(new URL('../standalone/catalog-view.js',import.meta.url),'utf8');
  const catalogLabels=[...source.matchAll(/'([^'\n]*[\u3400-\u9fff][^'\n]*)'/g)].map(match=>match[1]);
  const runtime=readFileSync(new URL('../src/runtime/wanban-app.js',import.meta.url),'utf8');
  const nativeList=runtime.slice(runtime.indexOf('  function nativeCatalog()')).match(/const labels = \[([^\]]+)\]/)?.[1] || '';
  const nativeLabels=[...nativeList.matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.ok(nativeLabels.includes('重新打开'),'native shell source labels are covered too');
  const labels=[...new Set([...catalogLabels,...nativeLabels,'我的','主导航','偏好设置','随时开一局',
    '收藏和排序未能保存，请检查设备存储空间',
    '备份包含游戏进度、历史记录、收藏和排序。换机前请先导出；导入也支持玩伴小屋的旧版游戏备份。',
    '已导出游戏进度、记录、收藏和排序。',
    '备份中包含的游戏进度、记录、收藏和排序将覆盖对应的当前数据。写入失败会保留原数据。确定导入吗？'])];
  assert.ok(catalogLabels.includes('长按拖动排序')); assert.ok(catalogLabels.includes('正在移动游戏，松开完成排序'));
  for (const {id} of LOCALES) {
    const service=createI18n({load,language:id}); await service.init();
    for (const label of labels) {
      assert.equal(typeof data[id].strings[label],'string',id+' missing '+label);
      assert.ok(data[id].strings[label].trim(),id+' empty '+label);
      assert.equal(service.translateSource(label),data[id].strings[label],id+' '+label);
    }
  }
  const english=createI18n({load,language:'en'}); await english.init();
  assert.equal(english.translateSource('我的'),'My games');
  assert.equal(english.translateSource('收藏游戏'),'Add to favorites');
  assert.equal(english.translateSource('取消收藏'),'Remove from favorites');
  assert.equal('23'+english.translateSource('款游戏'),'23 games','split numeric counter retains English spacing');
});

test('native catalog consumers use the active locale for shared dynamic score text', async () => {
  assert.equal(translateSource('当前最高分：120分'),'当前最高分：120分','before initialization, source stays readable');
  const host={navigator:{language:'en'},localStorage:memory(),CustomEvent:class {},dispatchEvent(){}};
  const active=await initI18n({document:null,window:host,fetch:async url=>({ok:true,json:()=>load(url.pathname.split('/').at(-1).slice(0,-5))})});
  assert.equal(translateSource('当前最高分：120分'),'Best: 120 points');
  assert.equal(translateSource('我的'),'My games');
  await active.setLocale('ja');
  assert.equal(translateSource('我的'),data.ja.strings['我的']);
  assert.equal(translateSource('当前最高分：120分'),active.translateSource('当前最高分：120分'));
  assert.equal(translateSource('private record'),'private record');
});
