import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCatalog} from '../standalone/catalog-view.js';

const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
class Node {
  constructor(tagName, document) {
    this.tagName = tagName; this.ownerDocument = document; this.children = []; this.parentNode = null;
    this.dataset = {}; this.attributes = {}; this.style = {}; this.className = ''; this.listeners = new Map(); this._text = '';
    this.classList = {
      add: value => { this.className = [...new Set([...this.className.split(' ').filter(Boolean),value])].join(' '); },
      remove: value => { this.className = this.className.split(' ').filter(item => item !== value).join(' '); },
      contains: value => this.className.split(' ').includes(value),
    };
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
  set textContent(value) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set innerHTML(value) { this.textContent = ''; this.html = value; }
  get innerHTML() { return this.html || ''; }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentNode?.isConnected; }
  setAttribute(name,value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataKey(name)] ?? null : this.attributes[name] ?? null; }
  matches(selector) {
    for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      const actual = this.getAttribute(match[1]); if (actual === null || (match[2] !== undefined && actual !== match[2])) return false;
    }
    const tag = selector.match(/^[a-z]+/i)?.[0]; return !tag || tag === this.tagName;
  }
  querySelectorAll(selector) {
    const found = []; for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(type,handler,options={}) {
    const capture = options === true || options.capture === true;
    const list = this.listeners.get(type) || [];
    if (!list.some(item => item.handler === handler && item.capture === capture)) list.push({handler,capture,passive:options.passive === true});
    this.listeners.set(type,list);
  }
  removeEventListener(type,handler,options={}) {
    const capture = options === true || options.capture === true;
    this.listeners.set(type,(this.listeners.get(type) || []).filter(item => item.handler !== handler || item.capture !== capture));
  }
  emit(type, values={}) {
    const event = {type,target:this,cancelable:true,defaultPrevented:false,stopped:false,
      preventDefault() { if (!this.passive) this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values};
    this.dispatch(event); return event;
  }
  dispatch(event) {
    for (const item of [...(this.listeners.get(event.type) || [])]) { event.passive = item.passive; item.handler(event); }
    event.passive = false;
    if (event.type === 'click') this.onclick?.(event);
    if (!event.stopped) this.parentNode?.dispatch(event);
  }
  click() { if (!this.disabled) this.emit('click'); }
}
function environment() {
  const document = new Node('document'); document.ownerDocument = document;
  document.createElement = tag => new Node(tag, document);
  document.body = document.createElement('body'); document.activeElement = null; document.hidden = false;
  document.elementFromPoint = () => document.hit;
  const window = new Node('window', document), timers = new Map(); let nextId = 0, now = 0;
  window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id,{callback,at:now+delay}); return id; };
  window.clearTimeout = id => timers.delete(id);
  document.defaultView = window;
  const advance = delay => { now += delay; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } };
  const container = document.createElement('div'); document.body.append(container);
  return {document,window,container,advance,timers};
}
const games = [
  {id:'snake',name:'贪吃蛇',mode:'single'}, {id:'gomoku',name:'五子棋',mode:'double'},
  {id:'tetris',name:'俄罗斯方块',mode:'single'}, {id:'reversi',name:'翻转棋',mode:'double'},
  {id:'paopao',name:'泡泡龙',mode:'single'},
];
const ids = games.map(game => game.id);
function setup(options={}) {
  const env = environment(), saved = [], launches = [], browsed = [];
  const cleanup = mountCatalog({container:env.container,games,preferences:{favorites:[],order:ids},
    onPreferencesChange:next => { saved.push(next); return true; },onLaunch:id=>launches.push(id),
    onBrowseGames:()=>browsed.push(true),scoreLabel:()=> '最高：0',...options});
  const query = selector => env.container.querySelector(selector);
  const shown = () => env.container.querySelectorAll('[data-game]').map(node => node.dataset.game);
  return {...env, saved, launches, browsed, cleanup, query, shown};
}
const point = (identifier=1,clientY=20) => ({identifier,clientX:20,clientY});
const activeListeners = node => [...node.listeners.values()].flat();

test('catalog filters by mode and keeps launch and favorite actions independent', () => {
  const view = setup(), launch = view.query('[data-game="snake"]'), favorite = view.query('[data-catalog-favorite="snake"]');
  assert.deepEqual(view.shown(),['snake','tetris','paopao']);
  assert.equal(view.query('.wb-cardgrid').parentNode,view.container,'updater mount retains a direct grid');
  assert.equal(view.container.dataset.wanbaCatalog,'single');
  assert.equal(launch.parentNode,favorite.parentNode); assert.equal(launch.contains(favorite),false);
  launch.click(); favorite.click();
  assert.deepEqual(view.launches,['snake']); assert.deepEqual(view.saved[0].favorites,['snake']);
  assert.equal(view.query('[data-catalog-favorite="snake"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(view.saved[0].order,ids);
  assert.deepEqual(setup({mode:'double'}).shown(),['gomoku','reversi']);
});

test('My favorites follow global order, remove immediately, and have a working empty-state action', () => {
  const view = setup({mode:'my',preferences:{favorites:['paopao','snake'],order:ids}});
  assert.deepEqual(view.shown(),['snake','paopao']);
  view.query('[data-catalog-favorite="snake"]').click();
  assert.deepEqual(view.shown(),['paopao']);
  view.query('[data-catalog-favorite="paopao"]').click();
  assert.deepEqual(view.shown(),[]); assert.match(view.query('.wanba-catalog-empty').textContent,/还没有收藏的游戏/);
  assert.equal(view.document.activeElement,view.query('.wanba-catalog-browse'));
  view.query('.wanba-catalog-browse').click(); assert.deepEqual(view.browsed,[true]);
  assert.deepEqual(view.launches,[]);
});

test('failed or throwing persistence leaves favorite state, focus target, and list unchanged', () => {
  for (const onPreferencesChange of [()=>false,()=>{throw Error('quota');}]) {
    const view = setup({onPreferencesChange}), favorite = view.query('[data-catalog-favorite="snake"]');
    favorite.focus(); favorite.click();
    assert.equal(view.query('[data-catalog-favorite="snake"]'),favorite);
    assert.equal(favorite.getAttribute('aria-pressed'),'false');
    assert.equal(view.document.activeElement,favorite); assert.deepEqual(view.shown(),['snake','tetris','paopao']);
  }
});

test('accessible sort controls replace visible slots only, then leave editing mode', () => {
  const view = setup(); view.query('.wanba-catalog-edit').click();
  assert.equal(view.container.dataset.catalogEditing,'true');
  assert.equal(view.query('[data-game="snake"]').disabled,true);
  view.query('[data-game="snake"]').click(); assert.deepEqual(view.launches,[]);
  assert.equal(view.query('[data-catalog-move="up"][data-id="snake"]').disabled,true);
  view.query('[data-catalog-move="up"][data-id="paopao"]').click();
  assert.deepEqual(view.saved[0].order,['snake','gomoku','paopao','reversi','tetris']);
  assert.deepEqual(view.shown(),['snake','paopao','tetris']);
  view.query('.wanba-catalog-edit').click(); assert.equal(view.container.dataset.catalogEditing,undefined);
  assert.equal(view.query('[data-game="snake"]').disabled,false);
});

test('ordinary touch scrolling cancels pending long press without prevention or saved reordering', () => {
  const view = setup(); view.query('.wanba-catalog-edit').click();
  assert.equal(activeListeners(view.document).length,0,'no permanent document gesture handlers');
  view.query('[data-catalog-drag="snake"]').emit('touchstart',{touches:[point()]});
  assert.equal(view.document.listeners.get('touchmove')[0].passive,true);
  const movement = view.document.emit('touchmove',{touches:[point(1,40)]});
  assert.equal(movement.defaultPrevented,false); view.advance(500);
  assert.equal(view.container.dataset.catalogDragging,undefined); assert.equal(view.timers.size,0);
  assert.equal(activeListeners(view.document).length,0); assert.deepEqual(view.saved,[]);
});

test('long-press touch dragging previews visually and commits only on release', () => {
  const view = setup(); view.query('.wanba-catalog-edit').click();
  view.query('[data-catalog-drag="snake"]').emit('touchstart',{touches:[point()]}); view.advance(400);
  assert.equal(view.container.dataset.catalogDragging,'true');
  assert.equal(view.document.listeners.get('touchmove')[0].passive,false);
  view.document.hit = view.query('[data-catalog-game="paopao"]');
  const movement = view.document.emit('touchmove',{touches:[point(1,160)]});
  assert.equal(movement.defaultPrevented,true); assert.deepEqual(view.saved,[]);
  assert.equal(view.query('[data-catalog-game="snake"]').style.order,'2');
  view.document.emit('touchend',{changedTouches:[point(1,160)]});
  assert.deepEqual(view.saved[0].order,['tetris','gomoku','paopao','reversi','snake']);
  assert.deepEqual(view.shown(),['tetris','paopao','snake']);
  assert.equal(view.container.dataset.catalogDragging,undefined); assert.equal(activeListeners(view.document).length,0);
});

test('failed drag save and canceled gestures restore the displayed order without side effects', () => {
  const view = setup({onPreferencesChange:()=>false}); view.query('.wanba-catalog-edit').click();
  for (const ending of ['touchend','touchcancel']) {
    view.query('[data-catalog-drag="snake"]').emit('touchstart',{touches:[point()]}); view.advance(400);
    view.document.hit = view.query('[data-catalog-game="paopao"]'); view.document.emit('touchmove',{touches:[point(1,160)]});
    view.document.emit(ending,{changedTouches:[point(1,160)]});
    assert.deepEqual(view.shown(),['snake','tetris','paopao']);
    assert.equal(view.query('[data-catalog-game="snake"]').style.order,'');
    assert.equal(activeListeners(view.document).length,0);
  }
});

test('hidden surface, cleanup, and remount dispose pending gestures and stale controls', () => {
  const view = setup(); view.query('.wanba-catalog-edit').click();
  view.query('[data-catalog-drag="snake"]').emit('touchstart',{touches:[point()]});
  view.document.hidden = true; view.document.emit('visibilitychange'); view.advance(500);
  assert.equal(activeListeners(view.document).length,0); assert.deepEqual(view.saved,[]);
  view.document.hidden = false;
  const oldFavorite = view.query('[data-catalog-favorite="snake"]');
  view.query('[data-catalog-drag="snake"]').emit('touchstart',{touches:[point()]});
  const nextCleanup = mountCatalog({container:view.container,games,mode:'my',preferences:{favorites:[],order:ids}});
  view.advance(500); oldFavorite.click();
  assert.equal(view.timers.size,0); assert.equal(activeListeners(view.document).length,0); assert.deepEqual(view.saved,[]);
  assert.equal(view.container.dataset.wanbaCatalog,'my');
  view.cleanup(); assert.equal(view.container.dataset.wanbaCatalog,'my','old cleanup does not affect the newer mount');
  nextCleanup(); nextCleanup(); assert.equal(view.container.children.length,0); assert.equal(view.container.dataset.wanbaCatalog,undefined);
});

test('mouse drag filters other pointers and blur cancels without saving', () => {
  const view = setup(); view.query('.wanba-catalog-edit').click();
  const start = () => view.query('[data-catalog-drag="snake"]').emit('pointerdown',{button:0,pointerType:'mouse',pointerId:7,clientX:20,clientY:20});
  start(); view.advance(400); view.document.hit = view.query('[data-catalog-game="tetris"]');
  view.document.emit('pointermove',{pointerId:99,clientX:20,clientY:100});
  assert.equal(view.query('[data-catalog-game="snake"]').style.order,undefined);
  view.document.emit('pointermove',{pointerId:7,clientX:20,clientY:100});
  view.window.emit('blur'); assert.deepEqual(view.saved,[]);
  assert.equal(view.query('[data-catalog-game="snake"]').style.order,'');
  start(); view.advance(400); view.document.emit('pointermove',{pointerId:7,clientX:20,clientY:100});
  view.document.emit('pointerup',{pointerId:7});
  assert.deepEqual(view.saved[0].order,['tetris','gomoku','snake','reversi','paopao']);
  assert.equal(activeListeners(view.window).length,0);
});

test('invalid catalog entries and duplicate metadata never produce extra launch controls', () => {
  const view = setup({games:[null,{}, {id:4}, ...games, games[0]]});
  assert.deepEqual(view.shown(),['snake','tetris','paopao']);
});
