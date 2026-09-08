// Locale data is part of the signed content snapshot. Translations are plain text, never HTML.
export const LOCALES = Object.freeze([
  {id:'zh-CN',name:'简体中文'}, {id:'zh-TW',name:'繁體中文'},
  {id:'en',name:'English'}, {id:'ja',name:'日本語'}, {id:'ko',name:'한국어'},
]);
export const LOCALE_STORAGE_KEY = 'wanba_locale_v1';
const supported = new Set(LOCALES.map(item=>item.id));
export function normalizeLocale(value) {
  const tag=String(value||'').replaceAll('_','-').toLowerCase();
  if (/^zh-(tw|hk|mo|hant)(-|$)/.test(tag)) return 'zh-TW';
  if (/^zh(-|$)/.test(tag)) return 'zh-CN';
  if (/^ja(-|$)/.test(tag)) return 'ja';
  if (/^ko(-|$)/.test(tag)) return 'ko';
  return 'en';
}
function validateCatalog(raw, locale) {
  if (!raw || raw.schemaVersion!==1 || raw.locale!==locale || typeof raw.brand!=='string') throw Error('Invalid language pack: '+locale);
  for (const group of ['strings','templates']) {
    if (!raw[group] || Array.isArray(raw[group]) || typeof raw[group]!=='object') throw Error('Invalid language strings');
    for(const [key,value] of Object.entries(raw[group])) if(typeof value!=='string'||value.length>8000||key.length>8000)throw Error('Invalid language string');
  }
  if(!raw.games||typeof raw.games!=='object')throw Error('Invalid game translations');
  for(const [id,game]of Object.entries(raw.games))if(!/^[a-z0-9]+$/.test(id)||typeof game?.title!=='string'||typeof game?.rules!=='string'||game.rules.length>12000)throw Error('Invalid game translation');
  return raw;
}
const interpolate=(text,params={})=>text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,(match,key)=>Object.hasOwn(params,key)?String(params[key]):match);
const own=(object,key)=>object&&Object.hasOwn(object,key)?object[key]:undefined;

export function createI18n({load,storage,language='zh-CN',onChange=()=>{}}={}) {
  let locale=normalizeLocale(language), catalog=null, fallback=null, generation=0;
  const cached=new Map();
  const loadCatalog=async id=>{
    if(cached.has(id))return cached.get(id);
    const next=validateCatalog(await load(id),id);cached.set(id,next);return next;
  };
  const service={
    get locale(){return locale;},
    get brand(){return catalog?.brand||'玩吧';},
    get version(){return catalog?.version||null;},
    async init(){
      try { const saved=storage?.getItem(LOCALE_STORAGE_KEY);if(supported.has(saved))locale=saved; } catch {}
      try {fallback=await loadCatalog('zh-CN');} catch {fallback=null;}
      await service.setLocale(locale,false);return service;
    },
    async setLocale(value,persist=true){
      const chosen=normalizeLocale(value), token=++generation;
      let next;try {next=await loadCatalog(chosen);} catch {next=fallback;}
      if(token!==generation)return false;
      catalog=next;locale=next?.locale||'zh-CN';
      if(persist)try{storage?.setItem(LOCALE_STORAGE_KEY,locale);}catch{}
      onChange(service);return locale===chosen;
    },
    t(key,params={},defaultText=key){
      const text=own(catalog?.strings,key)??own(catalog?.templates,key)??own(fallback?.strings,key)??own(fallback?.templates,key)??defaultText;
      return interpolate(text,params);
    },
    gameTitle(id,defaultText=id){return catalog?.games?.[id]?.title??fallback?.games?.[id]?.title??defaultText;},
    gameRules(id,defaultText=''){return (catalog?.games?.[id]?.rules??fallback?.games?.[id]?.rules??defaultText).replaceAll('{{char}}',service.t('电脑')).replaceAll('{{user}}',service.t('玩家'));},
    translateSource(value){
      if(typeof value!=='string'||!value.trim())return value;
      const source=value.trim(), known=own(catalog?.strings,source);
      let translated=known;
      if(translated===undefined) {
        const gameEntry=Object.entries(fallback?.games||{}).find(([,game])=>game.title===source);
        if(gameEntry)translated=service.gameTitle(gameEntry[0],source);
      }
      if(translated===undefined&&locale!=='zh-CN') {
        const rules=[
          [/^本局：(.+)$/,'score'],[/^最高：(.+)$/,'best'],[/^本局分数：(.+)$/,'currentScore'],
          [/^版本 (.+)$/,'version'],[/^内核：(.+)$/,'engine'],[/^游戏：(.+)$/,'game'],[/^模式：(.+)$/,'mode'],
          [/^当前最高分：(.+)$/,'best'],[/^胜率：(.+)$/,'wins'],[/^最短次数：(.+)$/,'fewest'],[/^最小次数：(.+)$/,'fewest'],[/^最默契：(.+)$/,'partner'],
          [/^资源版本 (.+)$/,'resourceVersion'],
          [/^步数[： ]([\d.,/]+|无限制)$/,'moves'],[/^配对：(.+)$/,'pairs'],[/^题面：(\d+)格$/,'givens'],
          [/^剩余雷：(.+)$/,'mines'],[/^已开：(.+)$/,'revealed'],[/^剩余[： ](.+)$/,'remaining'],[/^槽位：(.+)$/,'slots'],
          [/^进度 (.+)%$/,'progress'],[/^第 ?(\d+) ?关$/,'level'],[/^目标[： ](.+)$/,'target'],
          [/^(\d+)副$/,'runs'],[/^共 (\d+) 副$/,'totalRuns'],[/^(\d+) 步后发牌$/,'dealAfter'],[/^已走 (.+) 步$/,'dealtMoves'],
          [/^本关 (.+)$/,'levelScore'],[/^用时：(.+)秒$/,'timeSeconds'],[/^(\d+) 球$/,'balls'],
          [/^你的回合 · 回合 (\d+)$/,'turnRound'],[/^你的回合 · 可选 (\d+) 个$/,'numberChoices'],
        ];
        for(const [regex,key]of rules){const match=regex.exec(source);if(match){let value=service.translateSource(match[1]);if(key==='version'||key==='engine')for(const term of ['系统版','兼容版','浏览器预览','内置 GeckoView','系统 Android WebView','未知内核','（浏览器检测）'])value=value.replaceAll(term,service.t(term));translated=service.t(key,{value});break;}}
        if(translated===undefined){const number=/^([\d.,/+-]+)(分|胜|次)$/.exec(source);if(number)translated=number[1]+' '+service.t(number[2]);}
        if(translated===undefined){const match=/^可用版本 (.+) · (\d+) 个资源包 · (.+)$/.exec(source);if(match)translated=service.t('availableContent',{version:match[1],count:match[2],size:match[3]});}
        if(translated===undefined){const match=/^(提示|分数|总分)[： ](.*)$/.exec(source);if(match)translated=service.t('labelValue',{label:service.t(match[1]),value:service.translateSource(match[2])});}
        if(translated===undefined){const match=/^(高清|音效|随步归档|盲点)[： ](开|关)$/.exec(source);if(match)translated=service.t('toggle',{label:service.t(match[1]),value:service.t(match[2])});}
        if(translated===undefined){const match=/^连击：×(\d+) \/ 最高×(\d+)$/.exec(source);if(match)translated=service.t('comboBest',{value:match[1],best:match[2]});}
        if(translated===undefined){const match=/^按 1 → (\d+) 依次点击；点对后会变淡，错点会扣分。$/.exec(source);if(match)translated=service.t('numberHint',{value:match[1]});}
        if(translated===undefined){const match=/^步数 (\d+) · 已归位 (\d+)\/52$/.exec(source);if(match)translated=service.t('freecellProgress',{value:match[1],home:match[2]});}
        if(translated===undefined){const match=/^★ (\d+)\s+金币 (\d+)$/.exec(source);if(match)translated=service.t('coins',{stars:match[1],value:match[2]});}
        if(translated===undefined){const match=/^(小锤|重排) · (\d+)币$/.exec(source);if(match)translated=service.t('toolCost',{label:service.t(match[1]),value:match[2]});}
        if(translated===undefined){const match=/^(\d+)色 · (\d+)空$/.exec(source);if(match)translated=service.t('colorsBottles',{value:match[1],empty:match[2]});}
        if(translated===undefined){const match=/^学员 · (\d+)×$/.exec(source);if(match)translated=service.t('rank',{label:service.t('学员'),value:match[1]});}
        if(translated===undefined){const match=/^你的回合 · 你(\d+)张 \/ 电脑(\d+)张$/.exec(source);if(match)translated=service.t('handCounts',{value:match[1],computer:match[2]});}
        if(translated===undefined){const match=/^你的回合 · 你(\d+) \/ 电脑(\d+)$/.exec(source);if(match)translated=service.t('turnScores',{value:match[1],computer:match[2]});}
        if(translated===undefined){const match=/^你 (\d+) \/ 电脑 (\d+)$/.exec(source);if(match)translated=service.t('scores',{value:match[1],computer:match[2]});}
        if(translated===undefined){const match=/^你 (\d+)\/10 · 电脑 (\d+)\/10$/.exec(source);if(match)translated=service.t('camp',{value:match[1],computer:match[2]});}
        if(translated===undefined){const match=/^游戏基线 (.+) · (\d+) 款游戏$/.exec(source);if(match)translated=service.t('baseline',{value:match[1],count:match[2]});}
        if(translated===undefined)for(const [id,game]of Object.entries(fallback?.games||{})){
          if(source===game.title+' 有未结束的上一次进度，要继续还是重新开始？'){translated=service.t('saved',{game:service.gameTitle(id)});break;}
          if(source===game.title+' 请选择谁先出。'){translated=service.t('first',{game:service.gameTitle(id)});break;}
          if(source.startsWith(game.title+' · ')){translated=service.t('title',{game:service.gameTitle(id),label:service.translateSource(source.slice(game.title.length+3))});break;}
        }
      }
      if(translated===undefined)return value;
      return value.slice(0,value.indexOf(source))+translated+value.slice(value.indexOf(source)+source.length);
    },
  };
  return service;
}

let active=null, activeDocument=null, observer=null, queued=false, lastAppliedLocale=null;
const originals=new WeakMap(), attributes=new WeakMap();
const excluded='script,style,noscript,textarea,input,pre,code,svg,[contenteditable], [data-i18n-skip], .wb-guess-item, .wb-clue-box, .wanba-license-text';
const observation={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']};
function translateDocument() {
  if(!activeDocument||!active)return;
  // Chinese is the source UI. Do not rescan an animating board on each numeric update.
  if(active.locale==='zh-CN'&&lastAppliedLocale==='zh-CN')return;
  observer?.disconnect();
  try {
    const doc=activeDocument;
    doc.documentElement.lang=active.locale;doc.title=active.brand;
    const walker=doc.createTreeWalker(doc.body,4);let node;
    while((node=walker.nextNode())) {
      if(!node.parentElement||node.parentElement.closest(excluded)||node.parentElement.closest('[data-i18n-rules]'))continue;
      let record=originals.get(node);
      if(!record||node.nodeValue!==record.output)record={source:node.nodeValue,output:node.nodeValue};
      const translated=active.translateSource(record.source);if(node.nodeValue!==translated)node.nodeValue=translated;
      record.output=translated;originals.set(node,record);
    }
    for(const element of doc.querySelectorAll('[title],[aria-label],[placeholder]')) {
      if(element.closest('[data-i18n-skip],pre,code,.wanba-license-text'))continue;
      const records=attributes.get(element)||{};
      for(const attr of ['title','aria-label','placeholder']) {
        if(!element.hasAttribute(attr))continue;const current=element.getAttribute(attr);
        let record=records[attr];if(!record||current!==record.output)record={source:current,output:current};
        const translated=active.translateSource(record.source);if(translated!==current)element.setAttribute(attr,translated);
        record.output=translated;records[attr]=record;
      }attributes.set(element,records);
    }
    for(const rules of doc.querySelectorAll('[data-i18n-rules]')) {
      const text=active.gameRules(rules.dataset.i18nRules,rules.textContent);
      if(rules.textContent!==text)rules.textContent=text;
    }
    const imageUrl=new URL(active.locale.startsWith('zh')?'../assets/app-brand/app-icon.png':'../assets/app-brand/international/app-icon.png',import.meta.url).href;
    for(const image of doc.querySelectorAll('.wb-title > img,#wanba-boot > img'))if(image.src!==imageUrl)image.src=imageUrl;
    const favicon=doc.querySelector('link[rel="icon"]');if(favicon&&favicon.href!==imageUrl)favicon.href=imageUrl;
    for(const select of doc.querySelectorAll('[data-wanba-language]'))select.value=active.locale;
    lastAppliedLocale=active.locale;
  } finally {if(activeDocument?.body)observer?.observe(activeDocument.body,observation);}
}
function scheduleTranslation(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;translateDocument();});}
export async function initI18n({document:doc=globalThis.document,window:win=globalThis.window,fetch:fetcher=globalThis.fetch}={}) {
  activeDocument=doc;
  let storage;try{storage=win?.localStorage;}catch{}
  active=createI18n({
    storage,language:win?.navigator?.language||'zh-CN',
    load:async locale=>{const response=await fetcher(new URL('../locales/'+locale+'.json',import.meta.url));if(!response.ok)throw Error('Language pack unavailable');return response.json();},
    onChange:()=>{scheduleTranslation();win?.dispatchEvent(new win.CustomEvent('wanba-language-change',{detail:{locale:active?.locale}}));},
  });
  await active.init();
  return active;
}
export function observeLocalizedUI() {
  if(!activeDocument?.body||!active)return;
  observer?.disconnect();const Observer=activeDocument.defaultView?.MutationObserver||globalThis.MutationObserver;
  if(Observer)observer=new Observer(records=>{
    if(active?.locale==='zh-CN'&&lastAppliedLocale==='zh-CN')return;
    const hasSource=text=>/[\u3400-\u9fff]/.test(text||'');
    if(records.some(record=>record.type==='characterData'?hasSource(record.target.nodeValue):record.type==='attributes'?hasSource(record.target.getAttribute(record.attributeName)):[...record.addedNodes].some(node=>hasSource(node.textContent))))scheduleTranslation();
  });
  lastAppliedLocale=null;
  translateDocument();
}
export const t=(key,params={},fallback=key)=>active?.t(key,params,fallback)??interpolate(fallback,params);
export const gameTitle=(id,fallback=id)=>active?.gameTitle(id,fallback)??fallback;
export const gameRules=(id,fallback='')=>active?.gameRules(id,fallback)??fallback;
export const getLocale=()=>active?.locale||'zh-CN';
export const setLocale=value=>active?.setLocale(value)??Promise.resolve(false);
export function mountLanguagePicker(container) {
  if(!container||!active||container.querySelector('[data-wanba-language]'))return;
  const doc=container.ownerDocument,section=doc.createElement('section');section.className='wb-panel';
  const field=doc.createElement('div');field.className='wb-field';
  const label=doc.createElement('label');label.htmlFor='wanba-language';label.textContent='界面语言';
  const select=doc.createElement('select');select.id='wanba-language';select.className='wb-select';select.dataset.wanbaLanguage='';select.style.maxWidth='100%';
  for(const locale of LOCALES){const option=doc.createElement('option');option.value=locale.id;option.textContent=locale.name;option.dataset.i18nSkip='';select.append(option);}
  select.value=active.locale;
  select.onchange=async()=>{select.disabled=true;try{await setLocale(select.value);}finally{select.disabled=false;}};
  field.append(label,select);section.append(field);container.prepend(section);scheduleTranslation();
}
